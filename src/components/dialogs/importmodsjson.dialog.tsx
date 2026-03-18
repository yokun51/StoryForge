import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
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
import type { ModInfo } from "@/lib/types";
import { compareSemverAsc, pathDelimiter } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import type { Installation } from "@/stores/installations";

const importSchema = z.object({
	mods: z.array(
		z.object({
			disabled: z.boolean().optional(),
			id: z.union([z.string(), z.number()]),
			version: z.string(),
		}),
	),
});

export type ImportModsJsonDialogProps = {
	installation: Installation;
};

export function ImportModsJsonDialog({
	open,
	installation,
}: {
	open: boolean;
} & ImportModsJsonDialogProps) {
	const { closeDialog } = useDialogStore();
	const queryClient = useQueryClient();

	const [step, setStep] = useState<"input" | "loading" | "review">("input");
	const [jsonInput, setJsonInput] = useState("");

	const { data: targetModsData } = useInstalledMods(installation.path);
	const targetMods = targetModsData?.mods || [];

	const [parsedMods, setParsedMods] = useState<
		Array<{ id: string; version: string; disabled: boolean }>
	>([]);
	const [modNames, setModNames] = useState<Record<string, string>>({});

	const [newMods, setNewMods] = useState<
		Array<{ id: string; version: string; disabled: boolean }>
	>([]);
	const [conflicts, setConflicts] = useState<
		Array<{ id: string; version: string; disabled: boolean }>
	>([]);

	const [selectedNewMods, setSelectedNewMods] = useState<string[]>([]);
	const [conflictResolutions, setConflictResolutions] = useState<
		Record<string, "keep_target" | "use_json">
	>({});

	const handleLoadJson = async () => {
		try {
			const parsed = importSchema.parse(JSON.parse(jsonInput.trim()));
			const formattedMods = parsed.mods.map((m) => ({
				disabled: m.disabled ?? false,
				id: m.id.toString(),
				version: m.version,
			}));

			setParsedMods(formattedMods);
			setStep("loading");

			// Fetch les noms de mod depuis l'API VS car le JSON ne contient que des IDs
			const names: Record<string, string> = {};
			for (const m of formattedMods) {
				const tm = targetMods.find((t) => t.modid.toString() === m.id);
				if (tm) {
					names[m.id] = tm.name;
				} else {
					try {
						const info = await invoke<ModInfo>("fetch_mod_info", {
							modid: m.id,
						});
						names[m.id] = info.mod.name;
					} catch (e) {
						names[m.id] = `Unknown Mod (ID: ${m.id})`;
					}
				}
			}
			setModNames(names);

			const targetIds = new Set(targetMods.map((m) => m.modid.toString()));
			const newModsList = formattedMods.filter((sm) => !targetIds.has(sm.id));
			const conflictsList = formattedMods.filter((sm) => {
				const tm = targetMods.find((m) => m.modid.toString() === sm.id);
				return tm && tm.version !== sm.version;
			});

			setNewMods(newModsList);
			setConflicts(conflictsList);

			setSelectedNewMods(newModsList.map((m) => m.id));
			const initialResolutions: Record<string, "keep_target" | "use_json"> = {};
			for (const c of conflictsList) {
				const tm = targetMods.find((m) => m.modid.toString() === c.id);
				if (tm) {
					initialResolutions[c.id] =
						compareSemverAsc(c.version, tm.version) > 0
							? "use_json"
							: "keep_target";
				}
			}
			setConflictResolutions(initialResolutions);

			setStep("review");
		} catch (e) {
			toast.error(
				"Invalid JSON format. Please paste a valid export from Story Forge.",
			);
			setStep("input");
		}
	};

	const { mutate: importMods, isPending } = useMutation({
		mutationFn: async () => {
			let importedCount = 0;
			let current = 1;
			const totalToProcess =
				selectedNewMods.length +
				Object.values(conflictResolutions).filter((r) => r === "use_json")
					.length;

			for (const modid of selectedNewMods) {
				const pm = parsedMods.find((m) => m.id === modid);
				if (!pm) continue;

				const name = modNames[pm.id] || "Unknown";
				toast.loading(`Downloading ${name} (${current}/${totalToProcess})...`, {
					id: "import-json",
				});

				const info = await invoke<ModInfo>("fetch_mod_info", { modid });
				const release = info.mod.releases.find(
					(r) => r.modversion === pm.version,
				);
				if (!release)
					throw new Error(
						`Release ${pm.version} not found for mod ${info.mod.name}`,
					);

				const destpath = `${installation.path}${pathDelimiter}Mods`;
				await invoke("download_and_maybe_extract", {
					destpath,
					emitevent: `import-json-${modid}`,
					extract: false,
					url: release.mainfile,
				});

				await invoke("toggle_mod_state", {
					enable: !pm.disabled,
					modid: pm.id,
					path: installation.path,
					version: pm.version,
				});
				importedCount++;
				current++;
			}

			for (const [modid, resolution] of Object.entries(conflictResolutions)) {
				if (resolution === "use_json") {
					const pm = parsedMods.find((m) => m.id === modid);
					const tm = targetMods.find((m) => m.modid.toString() === modid);
					if (!pm || !tm) continue;

					const name = modNames[pm.id] || "Unknown";
					toast.loading(`Updating ${name} (${current}/${totalToProcess})...`, {
						id: "import-json",
					});

					const info = await invoke<ModInfo>("fetch_mod_info", { modid });
					const release = info.mod.releases.find(
						(r) => r.modversion === pm.version,
					);
					if (!release)
						throw new Error(
							`Release ${pm.version} not found for mod ${info.mod.name}`,
						);

					await invoke("remove_mod_from_installation", {
						params: { modpath: tm.path, path: installation.path },
					});

					const destpath = `${installation.path}${pathDelimiter}Mods`;
					await invoke("download_and_maybe_extract", {
						destpath,
						emitevent: `import-json-${modid}`,
						extract: false,
						url: release.mainfile,
					});

					await invoke("toggle_mod_state", {
						enable: !pm.disabled,
						modid: pm.id,
						path: installation.path,
						version: pm.version,
					});
					importedCount++;
					current++;
				}
			}
			return importedCount;
		},
		onError: (err) => {
			toast.dismiss("import-json");
			toast.error(`Error importing mods: ${err}`);
		},
		onSuccess: (count) => {
			toast.dismiss("import-json");
			if (count > 0) {
				toast.success(`Successfully imported/updated ${count} mod(s).`);
				queryClient.invalidateQueries({
					queryKey: installedModsQueryKey(installation.path),
				});
			}
			closeDialog();
		},
	});

	const handleClose = () => {
		if (isPending) return;
		setStep("input");
		setJsonInput("");
		closeDialog();
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogClose />
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Import from JSON</DialogTitle>
					<DialogDescription>
						Import mods from a JSON export into{" "}
						<span className="text-blue-200">{installation.name}</span>.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 mt-2">
					{step === "input" && (
						<div className="space-y-4">
							<Label>Paste Export JSON</Label>
							<textarea
								className="w-full h-48 p-2 border rounded resize-none bg-background text-sm font-mono"
								onChange={(e) => setJsonInput(e.target.value)}
								placeholder='{"mods":[{"id":"123","version":"1.0.0"}], ...}'
								value={jsonInput}
							/>
						</div>
					)}

					{step === "loading" && (
						<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
							<p>Fetching mod details...</p>
						</div>
					)}

					{step === "review" && (
						<ScrollArea className="h-80 rounded-md border p-4 bg-muted/20">
							{newMods.length === 0 && conflicts.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">
									No new mods to import or update from this JSON.
								</p>
							) : (
								<div className="space-y-6">
									{newMods.length > 0 && (
										<div className="space-y-3">
											<h4 className="font-semibold text-sm border-b pb-1">
												New Mods to Import ({newMods.length})
											</h4>
											{newMods.map((mod) => (
												<div className="flex items-center gap-3" key={mod.id}>
													<Checkbox
														checked={selectedNewMods.includes(mod.id)}
														id={`mod-${mod.id}`}
														onCheckedChange={(checked) => {
															if (checked) {
																setSelectedNewMods((prev) => [...prev, mod.id]);
															} else {
																setSelectedNewMods((prev) =>
																	prev.filter((id) => id !== mod.id),
																);
															}
														}}
													/>
													<Label
														className="flex flex-col cursor-pointer"
														htmlFor={`mod-${mod.id}`}
													>
														<span className="font-medium">
															{modNames[mod.id] || `Mod ID: ${mod.id}`}
														</span>
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
													(m) => m.modid.toString() === mod.id,
												);
												if (!targetMod) return null;

												return (
													<div
														className="flex items-center justify-between gap-4 p-2 rounded border bg-background"
														key={mod.id}
													>
														<div className="flex flex-col min-w-0">
															<span className="font-medium truncate">
																{modNames[mod.id] || targetMod.name}
															</span>
														</div>
														<Select
															onValueChange={(val) => {
																if (!val) return;
																setConflictResolutions((prev) => ({
																	...prev,
																	[mod.id]: val as "keep_target" | "use_json",
																}));
															}}
															value={conflictResolutions[mod.id]}
														>
															<SelectTrigger className="w-56 shrink-0 h-8">
																{conflictResolutions[mod.id] === "keep_target"
																	? `Keep Current (v${targetMod.version})`
																	: `Update to JSON (v${mod.version})`}
															</SelectTrigger>
															<SelectContent alignItemWithTrigger={false}>
																<SelectItem value="keep_target">
																	Keep Current (v{targetMod.version})
																</SelectItem>
																<SelectItem value="use_json">
																	Update to JSON (v{mod.version})
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
					{step === "input" && (
						<Button disabled={!jsonInput.trim()} onClick={handleLoadJson}>
							Load JSON
						</Button>
					)}
					{step === "review" && (
						<>
							<Button
								disabled={isPending}
								onClick={() => setStep("input")}
								variant="outline"
							>
								Back
							</Button>
							<Button
								disabled={
									isPending ||
									(selectedNewMods.length === 0 &&
										Object.values(conflictResolutions).every(
											(r) => r === "keep_target",
										))
								}
								onClick={() => importMods()}
							>
								{isPending ? "Importing..." : "Apply Import"}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
