import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	DownloadCloudIcon,
	LockIcon,
	PackageMinusIcon,
	PackagePlusIcon,
	PackageSearchIcon,
	UnlockIcon,
} from "lucide-react";
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
import { useLockedMods } from "@/hooks/use-locked-mods";
import {
	type ModUpdatesResponse,
	modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import { useToggleMod } from "@/hooks/use-toggle-mod";
import { useToggleModLock } from "@/hooks/use-toggle-mod-lock";
import type { ModInfo, ProgressPayload } from "@/lib/types";
import {
	cn,
	compareSemverAsc,
	compareSemverDesc,
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

	// Détecte si le mod est généré localement pour le mode hors-ligne
	const isLocalOnly = mod.summary === "Local/Offline mod";

	const installedMod = installedMods.find(
		(i) =>
			i.modid.toString() === mod.modid.toString() ||
			mod.modidstrs.includes(i.modid.toString()) ||
			(mod.urlalias &&
				i.modid.toString().toLowerCase() === mod.urlalias.toLowerCase()) ||
			i.name.toLowerCase() === mod.name.toLowerCase(),
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

	const { data: lockedMods } = useLockedMods(installation?.path ?? "");
	const isLocked =
		lockedMods?.includes(installedMod?.modid.toString() ?? "") ?? false;
	const { mutate: toggleLock } = useToggleModLock(installation?.path ?? "");

	const isCurrentlyDisabled = installedMod
		? disabledMods?.some(
				(d) =>
					d === installedMod.modid.toString() ||
					d.startsWith(`${installedMod.modid}@`),
			)
		: false;

	const { data: modInfo } = useQuery({
		enabled: !isLocalOnly, // Ne pas lancer la requête si c'est un mod purement local/hors-ligne
		queryFn: () =>
			invoke("fetch_mod_info", {
				modid: mod.modid.toString(),
			}) as Promise<ModInfo>,
		queryKey: ["modInfo", mod.modid],
		refetchOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
		retry: false, // Évite que react-query boucle indéfiniment si on n'a pas internet
	});

	const { openDialog } = useDialogStore();
	const { setAuthor, targetUpdateVersion, targetVersionMode } =
		useModsFilters();

	const actualTargetVersion = (
		targetUpdateVersion ||
		(installation?.version ?? "")
	).replace("-local", "");

	const targetRelease = modInfo
		? getTargetRelease(
				modInfo.mod.releases,
				actualTargetVersion,
				targetVersionMode,
			)
		: undefined;

	const absoluteLatest = modInfo
		? [...modInfo.mod.releases].sort((a, b) =>
				compareSemverDesc(a.modversion, b.modversion),
			)[0]
		: undefined;

	const hasVersionMismatch =
		targetRelease &&
		installedMod &&
		targetRelease.modversion !== installedMod.version &&
		!isLocked;

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
				`Error synchronizing ${modInfo?.mod.name} to ${installation?.name}: ${error.message}`,
				{ id: `add-mod-${modInfo?.mod.modid}-${installation?.id}` },
			);
			listenRef.current?.();
		},
		onMutate: async () => {
			toast.loading(
				`Synchronizing ${modInfo?.mod.name} to ${installation?.name}...`,
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
				`Successfully synchronized ${modInfo?.mod.name} to ${installation.name}`,
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
		<div
			className={cn([
				"flex flex-row p-2 justify-between w-full items-center",
				installedMod &&
					!isCurrentlyDisabled &&
					"bg-gradient-to-r from-success/20 to-transparent",
				installedMod &&
					isCurrentlyDisabled &&
					"bg-gradient-to-r from-muted/50 to-transparent opacity-80 grayscale",
				isLocked && "border-l-4 border-l-primary",
			])}
		>
			<div className="flex flex-row gap-2">
				<a
					href={`https://mods.vintagestory.at/${mod.urlalias ?? `show/mod/${mod.assetid}`}`}
					onClick={(e) => {
						if (isLocalOnly) e.preventDefault(); // Désactive le lien si hors-ligne
					}}
					rel="noreferrer"
					target="_blank"
				>
					<img
						alt={mod.name}
						className="w-12 h-12 rounded hover:scale-105 transition-transform"
						loading="lazy"
						onError={(e) => {
							// Image de secours si pas d'internet
							e.currentTarget.src = "/StoryForge.png";
						}}
						src={
							mod.logo ?? "https://mods.vintagestory.at/web/img/mod-default.png"
						}
					/>
				</a>
				<div className="flex flex-col justify-center">
					<div className="flex gap-1 items-center">
						<a
							className={cn("font-semibold", !isLocalOnly && "hover:underline")}
							href={`https://mods.vintagestory.at/${mod.urlalias ?? `show/mod/${mod.assetid}`}`}
							onClick={(e) => {
								if (isLocalOnly) e.preventDefault();
							}}
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
					<div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mt-1 items-center">
						{!isLocalOnly && (
							<>
								<span>{mod.downloads} dl</span>
								<span>{mod.follows} follows</span>
								<span className="text-muted-foreground/30">|</span>
							</>
						)}

						{installedMod ? (
							<>
								<span className="text-primary font-medium font-mono text-[10px]">
									Installed: v{installedMod.version}
								</span>
								{targetRelease && (
									<span
										className={cn(
											"font-mono text-[10px]",
											targetRelease.modversion !== installedMod.version &&
												!isLocked
												? "text-warning-foreground"
												: "",
										)}
									>
										{targetVersionMode === "latest" ? "Latest" : "Recommended"}:
										v{targetRelease.modversion}
									</span>
								)}
							</>
						) : (
							<>
								{absoluteLatest && (
									<span className="text-muted-foreground font-mono text-[10px]">
										Latest overall: v{absoluteLatest.modversion}
									</span>
								)}
								{targetRelease && (
									<span className="text-blue-300 font-mono text-[10px]">
										Target ({actualTargetVersion}): v{targetRelease.modversion}
									</span>
								)}
							</>
						)}
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
								toggleMod({
									enable: checked,
									// Assure-toi qu'on utilise bien le vrai ID stocké en local
									modid: installedMod.modid.toString(),
									version: installedMod.version,
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
					{installation && installedMod && hasVersionMismatch && (
						<Tooltip>
							<TooltipTrigger
								render={
									<GroupItem
										render={
											<Button
												aria-label="Sync Version"
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
								{compareSemverAsc(
									targetRelease!.modversion,
									installedMod.version,
								) > 0
									? "Update to compatible version"
									: "Downgrade to compatible version"}
							</TooltipContent>
							<GroupSeparator />
						</Tooltip>
					)}
					{!installedMod && installation && modInfo && (
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
												className={
													isLocked ? "text-primary-foreground opacity-100" : ""
												}
												onClick={() =>
													toggleLock({
														lock: !isLocked,
														modid: installedMod.modid.toString(),
													})
												}
												size="icon"
												variant={isLocked ? "default" : "outline"}
											/>
										}
									>
										{isLocked ? (
											<LockIcon aria-hidden="true" size={16} />
										) : (
											<UnlockIcon
												aria-hidden="true"
												className="opacity-60"
												size={16}
											/>
										)}
									</GroupItem>
								}
							/>
							<TooltipContent>
								{isLocked ? "Unlock Version" : "Lock Version (Ignore Updates)"}
							</TooltipContent>
							<GroupSeparator />
						</Tooltip>
					)}

					{/* Masque le bouton Update si on est hors-ligne car on ne pourrait pas lister les versions */}
					{installation &&
						installedMod &&
						modInfo &&
						modInfo.mod.releases.length > 0 && (
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
							// Masque le bouton Add Mod si hors-ligne car impossible à télécharger
							modInfo && (
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
							)
						))}
				</Group>
			</div>
		</div>
	);
}
