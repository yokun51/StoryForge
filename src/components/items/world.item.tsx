import { invoke } from "@tauri-apps/api/core";
import { formatDistanceToNow } from "date-fns";
import {
	ArchiveIcon,
	DownloadCloudIcon,
	HistoryIcon,
	MapIcon,
	PenIcon,
	PlayIcon,
	SproutIcon,
	TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Group, GroupItem, GroupSeparator } from "@/components/ui/group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBackupWorld } from "@/hooks/use-backup-world";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import type { World } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";

export const WorldItem = ({ world }: { world: World }) => {
	const { installations } = useInstallations();
	const { data: versions } = useInstalledVersions();
	const { openDialog } = useDialogStore();
	const [copiedText, copyToClipboard] = useCopyToClipboard();
	const worldData = world.data;
	const installation = installations.find(
		(installation) =>
			installation.path.split(/[/\\]/).pop() === world.installation_name,
	);
	const version = versions?.find((v) => v === installation?.version);

	const { mutate: installVersion, isPending: isInstalling } =
		useDownloadVersion();
	const { mutate: backupWorld, isPending: isBackingUp } = useBackupWorld();

	if (!installation) return null;
	if (!worldData) return null;

	const safeInstVer = installation.version.replace("-local", "");
	const safeLastSavedVer = worldData.last_saved_game_version?.replace(
		"-local",
		"",
	);
	const safeCreatedVer = worldData.created_game_version.replace("-local", "");

	const isDifferentVersion =
		safeLastSavedVer && safeLastSavedVer !== safeInstVer;

	return (
		<div className="grid grid-cols-[1fr_auto_min-content] gap-4 w-full items-center">
			<div className="flex flex-col min-w-0">
				<p className="text-sm truncate">
					{worldData.world_name}
					<Tooltip>
						<TooltipTrigger
							className={cn([
								"ml-2 text-xs opacity-50 cursor-pointer",
								worldData.seed.toString() === copiedText && "text-success",
							])}
							onClick={() => copyToClipboard(worldData.seed.toString())}
						>
							<SproutIcon className="inline h-4 w-4" />
						</TooltipTrigger>
						<TooltipContent className="flex flex-col gap-1 text-center">
							Seed: {worldData.seed}
							{worldData.seed.toString() === copiedText ? (
								<span className="text-success">Copied!</span>
							) : (
								<span className="text-muted-foreground text-xs">
									Click to copy
								</span>
							)}
						</TooltipContent>
					</Tooltip>
				</p>
				<p className="text-xs text-muted-foreground truncate">
					by{" "}
					<span className="text-warning-foreground">
						{worldData.created_by_player_name}
					</span>
					<span className="text-muted-foreground">
						{" "}
						in {worldData.created_game_version}
					</span>
				</p>
			</div>
			<div className="flex flex-col text-right whitespace-nowrap">
				<p className="text-sm text-muted-foreground">
					{installation.name}{" "}
					{isDifferentVersion ? (
						<Tooltip>
							<TooltipTrigger>
								<span className="text-xs text-warning-foreground opacity-50">
									(Different Version {worldData.last_saved_game_version} →{" "}
									{installation.version})
								</span>
							</TooltipTrigger>
							<TooltipContent>
								The installation version ({installation.version}) is different
								from the world's created version (
								{worldData.created_game_version}) or the last saved version (
								{worldData.last_saved_game_version}).
							</TooltipContent>
						</Tooltip>
					) : (
						<span className="text-xs opacity-50">
							({worldData.created_game_version}
							{safeLastSavedVer !== safeCreatedVer &&
							worldData.last_saved_game_version
								? ` → ${worldData.last_saved_game_version}`
								: ""}
							)
						</span>
					)}
				</p>
				<p className="text-xs text-muted-foreground">
					Last played:{" "}
					{worldData.last_played
						? formatDistanceToNow(new Date(worldData.last_played), {
								addSuffix: true,
							})
						: "Never"}
				</p>
			</div>
			<Group className="justify-end w-full shrink-0">
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										disabled={isInstalling}
										onClick={() => {
											if (version) {
												invoke("play_game", {
													options: {
														installation_id: installation.id,
														save: world.path
															.split(/[/\\]/)
															.pop()
															?.replace(".vcdbs", ""),
													},
												});
												toast.success(
													`Launching ${installation.name} on ${worldData.world_name}...`,
												);
											} else {
												installVersion(installation.version);
											}
										}}
										variant="outline"
									/>
								}
							>
								{version ? (
									<PlayIcon
										aria-hidden="true"
										className="-ms-1 opacity-60 text-success"
										size={16}
									/>
								) : (
									<DownloadCloudIcon
										aria-hidden="true"
										className="-ms-1 opacity-60 text-warning-foreground"
										size={16}
									/>
								)}
							</GroupItem>
						}
					/>
					<TooltipContent>
						{version ? "Play" : `Install ${installation.version}`}
					</TooltipContent>
				</Tooltip>
				<GroupSeparator />
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										disabled={isBackingUp}
										onClick={() => backupWorld(world)}
										variant="outline"
									/>
								}
							>
								<ArchiveIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-blue-300"
									size={16}
								/>
							</GroupItem>
						}
					/>
					<TooltipContent>Create Backup</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										className="relative"
										onClick={() => openDialog("RestoreWorldDialog", { world })}
										variant="outline"
									/>
								}
							>
								<HistoryIcon
									aria-hidden="true"
									className={cn(
										"-ms-1 opacity-60",
										world.backup_count > 0 && "text-success opacity-100",
									)}
									size={16}
								/>
								{world.backup_count > 0 && (
									<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-success text-[9px] font-bold text-success-foreground border border-background">
										{world.backup_count}
									</span>
								)}
							</GroupItem>
						}
					/>
					<TooltipContent>View & Restore Backups</TooltipContent>
				</Tooltip>
				<GroupSeparator />
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										disabled={!world.has_map}
										onClick={() => openDialog("ViewMapDialog", { world })}
										variant="outline"
									/>
								}
							>
								<MapIcon
									aria-hidden="true"
									className={cn(
										"-ms-1 opacity-60",
										!world.has_map ? "text-destructive" : "",
									)}
									size={16}
								/>
							</GroupItem>
						}
					/>
					<TooltipContent>
						{world.has_map
							? "View Map"
							: `No Map Available for ${worldData.world_name}`}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										onClick={() => openDialog("EditWorldDialog", { world })}
										variant="outline"
									/>
								}
							>
								<PenIcon
									aria-hidden="true"
									className="-ms-1 opacity-60"
									size={16}
								/>
							</GroupItem>
						}
					/>
					<TooltipContent>Edit</TooltipContent>
				</Tooltip>
				<GroupSeparator />
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										aria-label="Delete"
										onClick={() => openDialog("DeleteWorldDialog", { world })}
										size="icon"
										variant="outline"
									/>
								}
							>
								<TrashIcon
									aria-hidden="true"
									className="opacity-60"
									size={16}
								/>
							</GroupItem>
						}
					/>
					<TooltipContent>Delete</TooltipContent>
				</Tooltip>
			</Group>
		</div>
	);
};
