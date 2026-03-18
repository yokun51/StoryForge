import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAddModUpdateToInstallation } from "@/hooks/use-add-mod-update-to-installation";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
	type ModUpdate,
	type ModUpdatesResponse,
	modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import type { ModInfo } from "@/lib/types";
import { getTargetRelease } from "@/lib/utils";
import type { OutputMod } from "@/routes/install-mods/$id";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";

export const UpdateAllButton = ({
	installation,
	installedMods,
}: {
	installation: Installation;
	updates: ModUpdatesResponse | undefined;
	installedMods: OutputMod[];
}) => {
	const emitevent = `mod-updates-${installation?.id}-progress`;
	const queryClient = useQueryClient();
	const [wantsToUpdate, setWantsToUpdate] = useState(false);
	const { targetUpdateVersion, targetVersionMode } = useModsFilters();
	const actualTargetVersion = (
		targetUpdateVersion ||
		(installation?.version ?? "")
	).replace("-local", "");

	const { mutateAsync: removeModFromInstallation, isPending: removePending } =
		useMutation({
			mutationFn: (variables: {
				path: string;
				modpath: string;
				updateMod: ModUpdate & { modid: string };
			}) =>
				invoke("remove_mod_from_installation", {
					params: { modpath: variables.modpath, path: variables.path },
				}),
			onError: (error, variables) => {
				toast.error(
					`Error removing mod from ${installation.name}: ${error.message}`,
					{
						id: `mod-remove-${variables.path}-${variables.modpath}`,
					},
				);
			},
			onSuccess: async (_d, v) => {
				if (installation) {
					await addModToInstallation({
						emitevent,
						installation,
						mod: v.updateMod,
					});
				}
			},
		});

	const { mutateAsync: addModToInstallation, isPending } =
		useAddModUpdateToInstallation({
			onError: (error, variables) => {
				toast.error(
					`Error updating mod in ${variables.installation.name}: ${error.message}`,
					{
						id: `mod-update-${variables.installation.id}-${variables.mod.modidstr}`,
					},
				);
			},
		});

	const handleUpdateAll = async () => {
		if (wantsToUpdate) {
			toast.loading("Checking for compatible versions...", {
				id: `mod-updates-${installation.id}`,
			});
			let updatedCount = 0;

			// On itère sur TOUS les mods installés pour appliquer la syncro (downgrade & upgrade)
			for (const isInstalled of installedMods) {
				try {
					const modInfo = (await invoke("fetch_mod_info", {
						modid: isInstalled.modid.toString(),
					})) as ModInfo;

					const targetRelease = getTargetRelease(
						modInfo.mod.releases,
						actualTargetVersion,
						targetVersionMode,
					);

					if (
						targetRelease &&
						targetRelease.modversion !== isInstalled.version
					) {
						updatedCount++;
						toast.loading(`Synchronizing ${isInstalled.name}...`, {
							id: `mod-updates-${installation.id}`,
						});
						await removeModFromInstallation({
							modpath: isInstalled.path,
							path: installation.path,
							updateMod: {
								created: targetRelease.created,
								downloads: targetRelease.downloads,
								fileid: targetRelease.fileid,
								filename: targetRelease.filename,
								mainfile: targetRelease.mainfile,
								modid: isInstalled.modid.toString(),
								modidstr: targetRelease.modidstr,
								modversion: targetRelease.modversion,
								releaseid: targetRelease.releaseid,
								tags: targetRelease.tags,
							} as any,
						});
					}
				} catch (err) {
					console.error(`Failed to sync mod ${isInstalled.name}:`, err);
				}
			}

			await queryClient.invalidateQueries({
				queryKey: installedModsQueryKey(installation.path),
			});
			await queryClient.invalidateQueries({
				queryKey: modUpdatesQueryKey(installation.id),
			});

			if (updatedCount > 0) {
				toast.success(
					`Successfully synchronized ${updatedCount} mod(s) for ${installation.name}.`,
					{
						id: `mod-updates-${installation.id}`,
					},
				);
			} else {
				toast.success(
					`All mods are already compatible with ${actualTargetVersion}.`,
					{
						id: `mod-updates-${installation.id}`,
					},
				);
			}
			setWantsToUpdate(false);
		} else {
			setWantsToUpdate(true);
		}
	};

	return (
		<Button
			disabled={
				!installedMods ||
				installedMods.length === 0 ||
				isPending ||
				removePending
			}
			onClick={() => handleUpdateAll()}
			variant={wantsToUpdate ? "destructive" : "outline"}
		>
			{wantsToUpdate ? "Yes, really" : "Sync All"}
		</Button>
	);
};
