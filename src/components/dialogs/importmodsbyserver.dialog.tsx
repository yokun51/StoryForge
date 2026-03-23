import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import {
	installedModsQueryKey,
	useInstalledMods,
} from "@/hooks/use-installed-mods";
import { compareSemverAsc } from "@/lib/utils";
import type { OutputMod } from "@/routes/install-mods/$id";
import { useDialogStore } from "@/stores/dialogs";
import type { ImportModsDialogProps } from "./importmods.dialog";

export function ImportModsByServerDialog({
	open,
	installation,
}: { open: boolean } & ImportModsDialogProps) {
	const { closeDialog } = useDialogStore();
	const queryClient = useQueryClient();

	const [serverFolder, setServerFolder] = useState<string | null>(null);

	const { data: serverFolders } = useQuery({
		queryFn: () =>
			invoke("get_mods_by_server_folders", {
				path: installation.path,
			}) as Promise<string[]>,
		queryKey: ["modsByServerFolders", installation.path],
	});

	const { data: targetModsData } = useInstalledMods(installation.path);
	const targetMods = targetModsData?.mods || [];

	const { data: sourceModsData, isFetching: isLoadingSource } = useQuery({
		enabled: !!serverFolder,
		queryFn: () =>
			invoke("get_server_mods", {
				path: installation.path,
				serverFolder,
			}) as Promise<{ mods: OutputMod[] }>,
		queryKey: ["serverMods", installation.path, serverFolder],
	});
	const sourceMods = sourceModsData?.mods || [];

	const [newMods, setNewMods] = useState<OutputMod[]>([]);
	const [conflicts, setConflicts] = useState<OutputMod[]>([]);
	const [exactMatches, setExactMatches] = useState<OutputMod[]>([]);

	const [selectedNewMods, setSelectedNewMods] = useState<string[]>([]);
	const [conflictResolutions, setConflictResolutions] = useState<
		Record<string, "keep_target" | "use_source">
	>({});

	useEffect(() => {
		if (sourceMods.length > 0) {
			const targetIds = new Set(targetMods.map((m) => m.modid.toString()));

			// 1. Nouveaux mods (jamais installés)
			const calculatedNewMods = sourceMods.filter(
				(sm) => !targetIds.has(sm.modid.toString()),
			);

			// 2. Conflits (installés, mais version différente)
			const calculatedConflicts = sourceMods.filter((sm) => {
				const tm = targetMods.find(
					(m) => m.modid.toString() === sm.modid.toString(),
				);
				return tm && tm.version !== sm.version;
			});

			// 3. Déjà à jour (Même version)
			const calculatedExactMatches = sourceMods.filter((sm) => {
				const tm = targetMods.find(
					(m) => m.modid.toString() === sm.modid.toString(),
				);
				return tm && tm.version === sm.version;
			});

			setNewMods(calculatedNewMods);
			setConflicts(calculatedConflicts);
			setExactMatches(calculatedExactMatches);

			setSelectedNewMods(calculatedNewMods.map((m) => m.modid.toString()));

			const initialResolutions: Record<string, "keep_target" | "use_source"> =
				{};
			for (const c of calculatedConflicts) {
				const tm = targetMods.find(
					(m) => m.modid.toString() === c.modid.toString(),
				);
				if (tm) {
					initialResolutions[c.modid.toString()] =
						compareSemverAsc(c.version, tm.version) > 0
							? "use_source"
							: "keep_target";
				}
			}
			setConflictResolutions(initialResolutions);
		} else {
			setNewMods([]);
			setConflicts([]);
			setExactMatches([]);
			setSelectedNewMods([]);
			setConflictResolutions({});
		}
	}, [sourceMods, targetMods]);

	const { mutate: importMods, isPending } = useMutation({
		mutationFn: async () => {
			const filenamesToMove: string[] = [];
			const filenamesToDelete: string[] = [];

			// 1. Déplacer les nouveaux mods
			for (const modid of selectedNewMods) {
				const sm = sourceMods.find((m) => m.modid.toString() === modid);
				if (sm) {
					const filename = sm.path.split(/[/\\]/).pop();
					if (filename) filenamesToMove.push(filename);
				}
			}

			// 2. Gérer les conflits
			for (const [modid, resolution] of Object.entries(conflictResolutions)) {
				const sm = sourceMods.find((m) => m.modid.toString() === modid);
				const tm = targetMods.find((m) => m.modid.toString() === modid);

				if (sm && tm) {
					const filename = sm.path.split(/[/\\]/).pop();
					if (!filename) continue;

					if (resolution === "use_source") {
						// On remplace : Supprime l'ancien via l'API et déplace le nouveau
						await invoke("remove_mod_from_installation", {
							params: { modpath: tm.path, path: installation.path },
						});
						filenamesToMove.push(filename);
					} else {
						// "keep_target" : On garde sa propre version, donc le fichier du serveur est inutile
						filenamesToDelete.push(filename);
					}
				}
			}

			// 3. Nettoyer les mods "Déjà à jour"
			for (const sm of exactMatches) {
				const filename = sm.path.split(/[/\\]/).pop();
				if (filename) filenamesToDelete.push(filename);
			}

			let movedCount = 0;
			const deletedCount = filenamesToDelete.length;

			if (
				(filenamesToMove.length > 0 || filenamesToDelete.length > 0) &&
				serverFolder
			) {
				movedCount = await invoke("move_server_mods", {
					filenamesToDelete,
					filenamesToMove,
					path: installation.path,
					serverFolder,
				});
			}
			return { deleted: deletedCount, moved: movedCount };
		},
		onError: (err) => {
			toast.error(`Error importing server mods: ${err}`);
		},
		onSuccess: ({ moved, deleted }) => {
			if (moved > 0 || deleted > 0) {
				toast.success(
					`Success: Moved ${moved} mod(s) and cleaned up ${deleted} duplicate(s).`,
				);
				queryClient.invalidateQueries({
					queryKey: installedModsQueryKey(installation.path),
				});
				queryClient.invalidateQueries({
					queryKey: ["modsByServerFolders", installation.path],
				});
				setServerFolder(null);
			}
			closeDialog();
		},
	});

	return (
		<Dialog onOpenChange={() => !isPending && closeDialog()} open={open}>
			<DialogClose />
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Import from Server</DialogTitle>
					<DialogDescription>
						Move mods from your{" "}
						<span className="text-blue-200">ModsByServer</span> directory
						directly into your installation.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 mt-2">
					<div className="space-y-2">
						<Label>Server Folder</Label>
						<Select
							onValueChange={(val) => setServerFolder(val)}
							value={serverFolder || ""}
						>
							<SelectTrigger className="w-full">
								{serverFolder || "Select a server folder..."}
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								{!serverFolders || serverFolders.length === 0 ? (
									<p className="text-xs text-muted-foreground p-2">
										No ModsByServer folders found.
									</p>
								) : (
									serverFolders.map((folder) => (
										<SelectItem key={folder} value={folder}>
											{folder}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>

					{serverFolder && (
						<ScrollArea className="h-64 rounded-md border p-4 bg-muted/20">
							{isLoadingSource ? (
								<p className="text-sm text-muted-foreground text-center py-8">
									Reading mods...
								</p>
							) : newMods.length === 0 &&
								conflicts.length === 0 &&
								exactMatches.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">
									No valid mods to import from this folder.
								</p>
							) : (
								<div className="space-y-6">
									{newMods.length > 0 && (
										<div className="space-y-3">
											<h4 className="font-semibold text-sm border-b pb-1">
												New Mods ({newMods.length})
											</h4>
											{newMods.map((mod) => (
												<div
													className="flex items-center gap-3"
													key={mod.modid}
												>
													<Checkbox
														checked={selectedNewMods.includes(
															mod.modid.toString(),
														)}
														id={`servermod-${mod.modid}`}
														onCheckedChange={(checked) => {
															if (checked) {
																setSelectedNewMods((prev) => [
																	...prev,
																	mod.modid.toString(),
																]);
															} else {
																setSelectedNewMods((prev) =>
																	prev.filter(
																		(id) => id !== mod.modid.toString(),
																	),
																);
															}
														}}
													/>
													<Label
														className="flex flex-col cursor-pointer"
														htmlFor={`servermod-${mod.modid}`}
													>
														<span className="font-medium">{mod.name}</span>
														<span className="text-xs text-muted-foreground">
															v{mod.version}
														</span>
													</Label>
												</div>
											))}
										</div>
									)}

									{conflicts.length > 0 && (
										<div className="space-y-3">
											<h4 className="font-semibold text-sm border-b pb-1 text-warning-foreground">
												Version Conflicts ({conflicts.length})
											</h4>
											<p className="text-xs text-muted-foreground mb-2">
												These mods are already installed. Choose the version to
												keep.
											</p>
											{conflicts.map((mod) => {
												const targetMod = targetMods.find(
													(m) => m.modid.toString() === mod.modid.toString(),
												);
												if (!targetMod) return null;

												return (
													<div
														className="flex items-center justify-between gap-4 p-2 rounded border bg-background"
														key={mod.modid}
													>
														<div className="flex flex-col min-w-0">
															<span className="font-medium truncate">
																{mod.name}
															</span>
														</div>
														<Select
															onValueChange={(val) => {
																if (!val) return;
																setConflictResolutions((prev) => ({
																	...prev,
																	[mod.modid.toString()]: val as
																		| "keep_target"
																		| "use_source",
																}));
															}}
															value={conflictResolutions[mod.modid.toString()]}
														>
															<SelectTrigger className="w-56 shrink-0 h-8">
																{conflictResolutions[mod.modid.toString()] ===
																"keep_target"
																	? `Keep Current (v${targetMod.version})`
																	: `Update to Server (v${mod.version})`}
															</SelectTrigger>
															<SelectContent alignItemWithTrigger={false}>
																<SelectItem value="keep_target">
																	Keep Current (v{targetMod.version})
																</SelectItem>
																<SelectItem value="use_source">
																	Update to Server (v{mod.version})
																</SelectItem>
															</SelectContent>
														</Select>
													</div>
												);
											})}
										</div>
									)}

									{exactMatches.length > 0 && (
										<div className="space-y-3 opacity-60">
											<h4 className="font-semibold text-sm border-b pb-1 text-success">
												Already Up-to-Date ({exactMatches.length})
											</h4>
											<p className="text-xs text-muted-foreground mb-2">
												These mods are already correctly installed. Their files
												will be automatically cleaned up from the server folder.
											</p>
										</div>
									)}
								</div>
							)}
						</ScrollArea>
					)}
				</div>

				<DialogFooter className="mt-4">
					<Button
						disabled={
							!serverFolder ||
							isPending ||
							(newMods.length === 0 &&
								conflicts.length === 0 &&
								exactMatches.length === 0)
						}
						onClick={() => importMods()}
					>
						{isPending ? "Processing..." : "Move Selected & Clean Up"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
