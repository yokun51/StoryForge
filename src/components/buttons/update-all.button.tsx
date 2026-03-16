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
import { compareSemverAsc, getTargetRelease } from "@/lib/utils";
import type { OutputMod } from "@/routes/install-mods/$id";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";

export const UpdateAllButton = ({
	installation,
	updates,
	installedMods,
}: {
	installation: Installation;
	updates: ModUpdatesResponse;
	installedMods: OutputMod[];
}) => {
	const emitevent = `mod-updates-${installation?.id}-progress`;
	const queryClient = useQueryClient();
	const [wantsToUpdate, setWantsToUpdate] = useState(false);
	const { targetUpdateVersion } = useModsFilters();
	const actualTargetVersion =
		targetUpdateVersion || (installation?.version ?? "");

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
			toast.loading("Checking for compatible updates...", {
				id: `mod-updates-${installation.id}`,
			});
			let updatedCount = 0;

			for (const [modid, updateMod] of Object.entries(updates.updates)) {
				const isInstalled = installedMods?.find(
					(instMod) =>
						instMod.modid === Number(modid) ||
						instMod.modid.toString() === updateMod.modidstr,
				);
				if (!isInstalled) continue;

				const modInfo = (await invoke("fetch_mod_info", {
					modid: modid,
				})) as ModInfo;
				const targetRelease = getTargetRelease(
					modInfo.mod.releases,
					actualTargetVersion,
				);

				if (
					targetRelease &&
					compareSemverAsc(targetRelease.modversion, isInstalled.version) > 0
				) {
					updatedCount++;
					toast.loading(`Updating ${isInstalled.name}...`, {
						id: `mod-updates-${installation.id}`,
					});
					await removeModFromInstallation({
						modpath: isInstalled.path,
						path: installation.path,
						updateMod: {
							...updateMod,
							mainfile: targetRelease.mainfile,
							modid: modid,
							modversion: targetRelease.modversion,
						},
					});
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
					`Successfully updated ${updatedCount} mod(s) for ${installation.name}.`,
					{
						id: `mod-updates-${installation.id}`,
					},
				);
			} else {
				toast.success(
					`All mods are already up to date for ${actualTargetVersion}.`,
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
				!updates ||
				Object.keys(updates.updates).length === 0 ||
				isPending ||
				removePending
			}
			onClick={() => updates && handleUpdateAll()}
			variant={wantsToUpdate ? "destructive" : "outline"}
		>
			{wantsToUpdate ? "Yes, really" : "Update All"}
		</Button>
	);
};
