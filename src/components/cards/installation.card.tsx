import { formatDistanceToNow } from "date-fns";
import {
	CopyIcon,
	DownloadCloudIcon,
	PackagePlusIcon,
	Pencil,
	Play,
	Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Group, GroupItem } from "@/components/ui/group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { cn } from "@/lib/utils";
import type { Installation } from "@/stores/installations";

interface InstallationCardProps {
	installation: Installation;
	onPlay: (installation: Installation) => void;
	onUnfavorite: (installation: Installation) => void;
	onEdit: (installation: Installation) => void;
	onAddMods: (installation: Installation) => void;
	onDuplicate: (installation: Installation) => void;
}

export function InstallationCard({
	installation,
	onPlay,
	onUnfavorite,
	onEdit,
	onAddMods,
	onDuplicate,
}: InstallationCardProps) {
	const { mutate: installVersion, isPending: isInstalling } =
		useDownloadVersion();

	const { data: versionsData } = useInstalledVersions();
	const versions = versionsData?.map((v) => v.trim()) ?? [];
	const instVersion = installation.version?.trim() ?? "";

	return (
		<>
			<div className="flex items-center gap-3">
				<div
					className={`h-2 w-2 rounded-full ${
						versions.includes(instVersion)
							? "bg-success"
							: "bg-muted-foreground/40"
					}`}
				/>
				<Tooltip>
					<TooltipTrigger className="flex flex-col justify-start items-start text-left">
						<p className="font-mono text-sm text-foreground font-medium">
							{installation.name.trim()}
						</p>
						{installation.version && (
							<p className="font-mono text-xs text-muted-foreground">
								v{instVersion}
							</p>
						)}
					</TooltipTrigger>
					<TooltipContent>
						Last played:{" "}
						{installation.lastTimePlayed
							? formatDistanceToNow(new Date(installation.lastTimePlayed), {
									addSuffix: true,
								})
							: "Never"}
					</TooltipContent>
				</Tooltip>
			</div>
			<Group>
				<Tooltip>
					{versions.includes(instVersion) ? (
						<>
							<TooltipTrigger
								render={
									<GroupItem
										render={
											<Button
												className="h-8 w-8 text-muted-foreground hover:text-foreground"
												onClick={() => onPlay(installation)}
												size="icon"
												variant="ghost"
											/>
										}
									>
										<Play className="h-4 w-4" />
										<span className="sr-only">
											Play {installation.name.trim()}
										</span>
									</GroupItem>
								}
							/>
							<TooltipContent>Play {installation.name.trim()}</TooltipContent>
						</>
					) : (
						<>
							<TooltipTrigger
								render={
									<GroupItem
										render={
											<Button
												className="h-8 w-8 text-muted-foreground hover:text-foreground"
												disabled={isInstalling}
												onClick={() => installVersion(instVersion)}
												size="icon"
												variant="ghost"
											/>
										}
									>
										<DownloadCloudIcon className="h-4 w-4" />
										<span className="sr-only">
											Download version {instVersion}
										</span>
									</GroupItem>
								}
							/>
							<TooltipContent>Download version {instVersion}</TooltipContent>
						</>
					)}
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										className="h-8 w-8 text-muted-foreground hover:text-foreground"
										onClick={() => onAddMods(installation)}
										size="icon"
										variant="ghost"
									/>
								}
							>
								<PackagePlusIcon className="h-4 w-4" />
								<span className="sr-only">
									Add mods to {installation.name.trim()}
								</span>
							</GroupItem>
						}
					/>
					<TooltipContent>Add mods</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										className="h-8 w-8 text-muted-foreground hover:text-foreground"
										onClick={() => onEdit(installation)}
										size="icon"
										variant="ghost"
									/>
								}
							>
								<Pencil className="h-4 w-4" />
								<span className="sr-only">Edit {installation.name.trim()}</span>
							</GroupItem>
						}
					/>
					<TooltipContent>Edit {installation.name.trim()}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										className="h-8 w-8 text-muted-foreground hover:text-foreground"
										onClick={() => onDuplicate(installation)}
										size="icon"
										variant="ghost"
									/>
								}
							>
								<CopyIcon className="h-4 w-4" />
								<span className="sr-only">
									Duplicate {installation.name.trim()}
								</span>
							</GroupItem>
						}
					/>
					<TooltipContent>Duplicate {installation.name.trim()}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<GroupItem
								render={
									<Button
										className={cn(
											"h-8 w-8",
											installation.favorite
												? "text-warning"
												: "hover:text-foreground text-muted-foreground",
										)}
										onClick={() => onUnfavorite(installation)}
										size="icon"
										variant="ghost"
									/>
								}
							>
								<Star
									className={cn(
										"h-4 w-4",
										installation.favorite && "fill-warning",
									)}
								/>
								<span className="sr-only">
									{installation.favorite ? "Unfavorite" : "Favorite"}{" "}
									{installation.name.trim()}
								</span>
							</GroupItem>
						}
					/>
					<TooltipContent>
						{installation.favorite ? "Unfavorite" : "Favorite"}
					</TooltipContent>
				</Tooltip>
			</Group>
		</>
	);
}
