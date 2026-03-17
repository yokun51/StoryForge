import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useDisabledMods } from "@/hooks/use-disabled-mods";
import {
	installedModsQueryKey,
	useInstalledMods,
} from "@/hooks/use-installed-mods";
import { compareSemverAsc, pathDelimiter } from "@/lib/utils";
import type { OutputMod } from "@/routes/install-mods/$id";
import { useDialogStore } from "@/stores/dialogs";
import { type Installation, useInstallations } from "@/stores/installations";

export type ImportModsDialogProps = {
	installation: Installation;
};

export function ImportModsDialog({
	open,
	installation,
}: {
	open: boolean;
} & ImportModsDialogProps) {
	const { closeDialog } = useDialogStore();
	const { installations } = useInstallations();
	const queryClient = useQueryClient();

	const [sourceId, setSourceId] = useState<number | null>(null);
	const sourceInstallation = installations.find((i) => i.id === sourceId);

	const { data: targetModsData } = useInstalledMods(installation.path);
	const targetMods = targetModsData?.mods || [];

	const { data: sourceModsData } = useInstalledMods(
		sourceInstallation?.path || "",
		{ enabled: !!sourceInstallation },
	);
	const sourceMods = sourceModsData?.mods || [];

	const { data: sourceDisabledModsData } = useDisabledMods(
		sourceInstallation?.path || "",
	);
	const sourceDisabledMods = sourceDisabledModsData || [];

	const [newMods, setNewMods] = useState<OutputMod[]>([]);
	const [conflicts, setConflicts] = useState<OutputMod[]>([]);

	const [selectedNewMods, setSelectedNewMods] = useState<string[]>([]);
	const [conflictResolutions, setConflictResolutions] = useState<
		Record<string, "keep_target" | "use_source">
	>({});

	useEffect(() => {
		if (sourceMods.length > 0) {
			const targetIds = new Set(targetMods.map((m) => m.modid.toString()));

			const calculatedNewMods = sourceMods.filter(
				(sm) => !targetIds.has(sm.modid.toString()),
			);

			const calculatedConflicts = sourceMods.filter((sm) => {
				const tm = targetMods.find(
					(m) => m.modid.toString() === sm.modid.toString(),
				);
				return tm && tm.version !== sm.version;
			});

			setNewMods(calculatedNewMods);
			setConflicts(calculatedConflicts);

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
			setSelectedNewMods([]);
			setConflictResolutions({});
		}
	}, [sourceMods, targetMods]);

	const { mutate: importMods, isPending } = useMutation({
		mutationFn: async () => {
			let importedCount = 0;

			for (const modid of selectedNewMods) {
				const sm = sourceMods.find((m) => m.modid.toString() === modid);
				if (sm) {
					const fileName = sm.path.split(/[/\\]/).pop();
					const destPath = `${installation.path}${pathDelimiter}Mods${pathDelimiter}${fileName}`;
					await invoke("copy_mod_file", {
						destPath,
						sourcePath: sm.path,
					});
					importedCount++;

					const isDisabled = sourceDisabledMods.some(
						(d) => d === sm.modid.toString() || d.startsWith(`${sm.modid}@`),
					);
					await invoke("toggle_mod_state", {
						enable: !isDisabled,
						modid: sm.modid.toString(),
						path: installation.path,
						version: sm.version,
					});
				}
			}

			for (const [modid, resolution] of Object.entries(conflictResolutions)) {
				if (resolution === "use_source") {
					const sm = sourceMods.find((m) => m.modid.toString() === modid);
					const tm = targetMods.find((m) => m.modid.toString() === modid);

					if (sm && tm) {
						await invoke("remove_mod_from_installation", {
							params: { modpath: tm.path, path: installation.path },
						});

						const fileName = sm.path.split(/[/\\]/).pop();
						const destPath = `${installation.path}${pathDelimiter}Mods${pathDelimiter}${fileName}`;
						await invoke("copy_mod_file", {
							destPath,
							sourcePath: sm.path,
						});
						importedCount++;

						const isDisabled = sourceDisabledMods.some(
							(d) => d === sm.modid.toString() || d.startsWith(`${sm.modid}@`),
						);
						await invoke("toggle_mod_state", {
							enable: !isDisabled,
							modid: sm.modid.toString(),
							path: installation.path,
							version: sm.version,
						});
					}
				}
			}
			return importedCount;
		},
		onError: (err) => {
			toast.error(`Error importing mods: ${err}`);
		},
		onSuccess: (count) => {
			if (count > 0) {
				toast.success(`Successfully imported/updated ${count} mod(s).`);
				queryClient.invalidateQueries({
					queryKey: installedModsQueryKey(installation.path),
				});
			}
			closeDialog();
		},
	});

	const availableSources = installations.filter(
		(i) => i.id !== installation.id,
	);

	return (
		<Dialog onOpenChange={() => !isPending && closeDialog()} open={open}>
			<DialogClose />
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Import Mods</DialogTitle>
					<DialogDescription>
						Import mods from another installation into{" "}
						<span className="text-blue-200">{installation.name}</span>.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 mt-2">
					<div className="space-y-2">
						<Label>Source Installation</Label>
						<Select
							onValueChange={(val) => {
								if (val) setSourceId(Number(val));
							}}
							value={sourceId?.toString() || ""}
						>
							<SelectTrigger className="w-full">
								{sourceInstallation?.name ||
									"Select an installation to import from..."}
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								{availableSources.map((inst) => (
									<SelectItem key={inst.id} value={inst.id.toString()}>
										{inst.name} ({inst.version})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{sourceInstallation && (
						<ScrollArea className="h-64 rounded-md border p-4 bg-muted/20">
							{newMods.length === 0 && conflicts.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">
									No mods to import or update from this installation.
								</p>
							) : (
								<div className="space-y-6">
									{newMods.length > 0 && (
										<div className="space-y-3">
											<h4 className="font-semibold text-sm border-b pb-1">
												New Mods to Import ({newMods.length})
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
														id={`mod-${mod.modid}`}
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
														htmlFor={`mod-${mod.modid}`}
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
												These mods are already installed. Choose which version
												to keep.
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
																	: `Update to Source (v${mod.version})`}
															</SelectTrigger>
															<SelectContent alignItemWithTrigger={false}>
																<SelectItem value="keep_target">
																	Keep Current (v{targetMod.version})
																</SelectItem>
																<SelectItem value="use_source">
																	Update to Source (v{mod.version})
																</SelectItem>
															</SelectContent>
														</Select>
													</div>
												);
											})}
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
							!sourceId ||
							isPending ||
							(newMods.length === 0 && conflicts.length === 0)
						}
						onClick={() => importMods()}
					>
						{isPending ? "Importing..." : "Apply Import"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
