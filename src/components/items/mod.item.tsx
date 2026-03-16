import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	DownloadCloudIcon,
	PackageMinusIcon,
	PackagePlusIcon,
	PackageSearchIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { toast } from "sonner";
import type { Mod } from "@/components/lists/mod.list";
import { Button } from "@/components/ui/button";
import { Group, GroupItem, GroupSeparator } from "@/components/ui/group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAddLatestModVersion } from "@/hooks/use-add-latest-mod-version";
import { useDisabledMods } from "@/hooks/use-disabled-mods";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
	type ModUpdatesResponse,
	modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import { useToggleMod } from "@/hooks/use-toggle-mod";
import type { ModInfo, ProgressPayload } from "@/lib/types";
import {
	cn,
	compareSemverAsc,
	getTargetRelease,
	pathDelimiter,
} from "@/lib/utils";
import type { OutputMod } from "@/routes/install-mods/$id";
import { useDialogStore } from "@/stores/dialogs";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";

export function ModItem({
	mod,
	installedMods,
	modUpdates,
	installation,
}: {
	mod: Mod;
	installedMods: OutputMod[];
	modUpdates: ModUpdatesResponse | undefined;
	installation: Installation | null;
}) {
	const queryClient = useQueryClient();
	const listenRef = useRef<UnlistenFn>(null);
	const emitevent = `mod-download-${mod.modid}-${installation?.id}`;
	const installedMod = installedMods.find(
		(i) => i.modid === mod.modid || mod.modidstrs.includes(i.modid.toString()),
	);
	const updateMod =
		modUpdates?.updates[mod.modidstrs[0]] ??
		modUpdates?.updates[mod.modid.toString()] ??
		modUpdates?.updates[mod.assetid.toString()] ??
		modUpdates?.updates[mod.urlalias ?? ""];

	const { data: disabledMods } = useDisabledMods(installation?.path ?? "");
	const { mutate: toggleMod, isPending: isToggling } = useToggleMod(
		installation?.path ?? "",
	);

	// FIX: On ajoute .toString() pour correspondre au type string[]
	const isCurrentlyDisabled = installedMod
		? disabledMods?.includes(installedMod.modid.toString())
		: false;

	const { data: modInfo } = useQuery({
		enabled: !!updateMod,
		queryFn: () =>
			updateMod &&
			(invoke("fetch_mod_info", {
				modid: updateMod?.modidstr,
			}) as Promise<ModInfo>),
		queryKey: ["modInfo", mod.modid],
		refetchOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});

	const { openDialog } = useDialogStore();
	const { setAuthor, targetUpdateVersion } = useModsFilters();

	const actualTargetVersion =
		targetUpdateVersion || (installation?.version ?? "");
	const targetRelease = modInfo
		? getTargetRelease(modInfo.mod.releases, actualTargetVersion)
		: undefined;
	const hasValidUpdate =
		targetRelease &&
		installedMod &&
		compareSemverAsc(targetRelease.modversion, installedMod.version) > 0;

	const { mutate: downloadLatestModVersion, isPending: isDownloading } =
		useAddLatestModVersion({
			installation,
			mod,
		});

	const { mutate: removeModFromInstallation, isPending: removePending } =
		useMutation({
			mutationFn: ({ path, modpath }: { path: string; modpath: string }) =>
				invoke("remove_mod_from_installation", { params: { modpath, path } }),
			onError: (error, variables) => {
				toast.error(
					`Error removing mod from ${installation?.name}: ${error.message}`,
					{
						id: `mod-remove-${variables.path}-${variables.modpath}`,
					},
				);
			},
			onSuccess: () => {
				addModToInstallation({
					path: `${installation?.path}${pathDelimiter}Mods`,
					url: targetRelease?.mainfile || updateMod?.mainfile || "",
				});
			},
		});

	const { mutate: addModToInstallation, isPending } = useMutation({
		mutationFn: ({ path, url }: { path: string; url: string }) =>
			invoke("download_and_maybe_extract", {
				destpath: path,
				emitevent,
				extract: false,
				url,
			}) as Promise<string>,
		onError: (error) => {
			toast.error(
				`Error upgrading/downgrading ${modInfo?.mod.name} to ${installation?.name}: ${error.message}`,
				{ id: `add-mod-${modInfo?.mod.modid}-${installation?.id}` },
			);
			listenRef.current?.();
		},
		onMutate: async () => {
			toast.loading(
				`Updating ${modInfo?.mod.name} to ${installation?.name}...`,
				{
					id: `add-mod-${modInfo?.mod.modid}-${installation?.id}`,
				},
			);
			listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
				const { phase, percent } = event.payload;
				if (phase === "download") {
					toast.loading(
						`Downloading ${modInfo?.mod.name} to ${installation?.name}... ${percent?.toFixed(0)}%`,
						{ id: `add-mod-${modInfo?.mod.modid}-${installation?.id}` },
					);
				}
			});
		},
		onSuccess: async () => {
			if (installation === null) return;
			listenRef.current?.();
			toast.success(
				`Successfully updated ${modInfo?.mod.name} to ${installation.name}`,
				{ id: `add-mod-${modInfo?.mod.modid}-${installation.id}` },
			);
			await queryClient.invalidateQueries({
				queryKey: modUpdatesQueryKey(installation.id),
			});
			await queryClient.invalidateQueries({
				queryKey: installedModsQueryKey(installation.path),
			});
		},
	});

	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className={cn([
				"flex flex-row p-2 justify-between w-full items-center",
				installedMod &&
					!isCurrentlyDisabled &&
					"bg-gradient-to-r from-success/20 to-transparent",
				installedMod &&
					isCurrentlyDisabled &&
					"bg-gradient-to-r from-muted/50 to-transparent opacity-80 grayscale",
			])}
			exit={{ opacity: 0, y: 12 }}
			initial={{ opacity: 0, y: 12 }}
		>
			<div className="flex flex-row gap-2">
				<a
					href={`https://mods.vintagestory.at/${mod.urlalias ?? `show/mod/${mod.assetid}`}`}
					rel="noreferrer"
					target="_blank"
				>
					<img
						alt={mod.name}
						className="w-12 h-12 rounded hover:scale-105 transition-transform"
						loading="lazy"
						src={
							mod.logo ?? "https://mods.vintagestory.at/web/img/mod-default.png"
						}
					/>
				</a>
				<div className="flex flex-col">
					<div className="flex gap-1 items-center">
						<a
							className="hover:underline font-semibold"
							href={`https://mods.vintagestory.at/${mod.urlalias ?? `show/mod/${mod.assetid}`}`}
							rel="noreferrer"
							target="_blank"
						>
							<h3 className="font-semibold">{mod.name}</h3>
						</a>
						<p className="text-xs opacity-50">by</p>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											className="text-xs opacity-50 text-orange-200 cursor-pointer bg-transparent border-none p-0 outline-none hover:underline"
											onClick={() => setAuthor(mod.author)}
											type="button"
										/>
									}
								>
									{mod.author}
								</TooltipTrigger>
								<TooltipContent>
									Click to filter by author {mod.author}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
					<p className="text-sm text-muted-foreground line-clamp-1">
						{mod.summary}
					</p>
					<div className="flex gap-2 text-xs text-muted-foreground mt-1">
						<span>{mod.downloads} downloads</span>
						<span>{mod.follows} follows</span>
						<span>{mod.comments} comments</span>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-4">
				{installedMod && installation && (
					<div className="flex items-center gap-2 shrink-0">
						<Switch
							checked={!isCurrentlyDisabled}
							disabled={isToggling}
							id={`toggle-${mod.modid}`}
							onCheckedChange={(checked) => {
								// FIX: On ajoute .toString() pour correspondre à l'attente du type string
								toggleMod({
									enable: checked,
									modid: installedMod.modid.toString(),
								});
							}}
						/>
						<Label
							className="text-xs cursor-pointer select-none"
							htmlFor={`toggle-${mod.modid}`}
						>
							{isCurrentlyDisabled ? "Disabled" : "Enabled"}
						</Label>
					</div>
				)}

				<Group>
					{updateMod && installation && installedMod && hasValidUpdate && (
						<Tooltip>
							<TooltipTrigger
								render={
									<GroupItem
										render={
											<Button
												aria-label="Update to Latest Version"
												disabled={isPending || removePending}
												onClick={() =>
													removeModFromInstallation({
														modpath: installedMod?.path ?? "",
														path: installation.path,
													})
												}
												size="icon"
												variant="outline"
											/>
										}
									>
										<DownloadCloudIcon
											aria-hidden="true"
											className="opacity-60"
											size={16}
										/>
									</GroupItem>
								}
							/>
							<TooltipContent>
								<span className="text-xs text-muted-foreground">
									{installedMod.version} →{" "}
									{targetRelease?.modversion ?? "Unknown"}
								</span>
								<br />
								Install compatible version
							</TooltipContent>
							<GroupSeparator />
						</Tooltip>
					)}
					{!installedMod && installation && (
						<Tooltip>
							<TooltipTrigger
								render={
									<GroupItem
										render={
											<Button
												aria-label="Download Latest Version"
												disabled={isDownloading}
												onClick={() =>
													downloadLatestModVersion({
														path: `${installation.path}${pathDelimiter}Mods`,
													})
												}
												size="icon"
												variant="outline"
											/>
										}
									>
										<DownloadCloudIcon
											aria-hidden="true"
											className="opacity-60"
											size={16}
										/>
									</GroupItem>
								}
							/>
							<TooltipContent>Install version</TooltipContent>
							<GroupSeparator />
						</Tooltip>
					)}
					{installation && installedMod && (
						<Tooltip>
							<TooltipTrigger
								render={
									<GroupItem
										render={
											<Button
												aria-label="Update"
												onClick={() =>
													openDialog("UpdateModDialog", {
														installation,
														mod: installedMod,
														versionFrom: installedMod.version,
													})
												}
												size="icon"
												variant="outline"
											/>
										}
									>
										<PackageSearchIcon
											aria-hidden="true"
											className="opacity-60"
											size={16}
										/>
									</GroupItem>
								}
							/>
							<TooltipContent>Look through available versions</TooltipContent>
							<GroupSeparator />
						</Tooltip>
					)}
					{installation &&
						(installedMod ? (
							<Tooltip>
								<TooltipTrigger
									render={
										<GroupItem
											render={
												<Button
													aria-label="Remove"
													onClick={() =>
														openDialog("RemoveModDialog", {
															installation,
															name: mod.name,
															path: installedMod.path ?? "",
														})
													}
													size="icon"
													variant="destructive-outline"
												/>
											}
										>
											<PackageMinusIcon
												aria-hidden="true"
												className="opacity-60 text-destructive"
												size={16}
											/>
										</GroupItem>
									}
								/>
								<TooltipContent>Remove</TooltipContent>
							</Tooltip>
						) : (
							<Tooltip>
								<TooltipTrigger
									render={
										<GroupItem
											render={
												<Button
													aria-label="Add Mod"
													onClick={() =>
														openDialog("AddModDialog", {
															installation,
															modid: mod.modid,
														})
													}
													size="icon"
													variant="outline"
												/>
											}
										>
											<PackagePlusIcon
												aria-hidden="true"
												className="opacity-60"
												size={16}
											/>
										</GroupItem>
									}
								/>
								<TooltipContent>Add Mod</TooltipContent>
							</Tooltip>
						))}
				</Group>
			</div>
		</motion.div>
	);
}
