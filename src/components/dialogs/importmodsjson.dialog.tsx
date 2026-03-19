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
import type { Mod } from "../lists/mod.list";

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

type ParsedMod = {
	id: string;
	apiId: string | null;
	version: string;
	disabled: boolean;
	apiAvailable: boolean;
	originalName?: string;
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

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

	const [parsedMods, setParsedMods] = useState<ParsedMod[]>([]);
	const [modNames, setModNames] = useState<Record<string, string>>({});

	const [newMods, setNewMods] = useState<ParsedMod[]>([]);
	const [conflicts, setConflicts] = useState<ParsedMod[]>([]);

	const [selectedNewMods, setSelectedNewMods] = useState<string[]>([]);
	const [conflictResolutions, setConflictResolutions] = useState<
		Record<string, "keep_target" | "use_imported">
	>({});

	const handleSmartParse = async () => {
		try {
			let formattedMods: Array<{
				id: string;
				version: string;
				disabled: boolean;
				originalName?: string;
				apiId?: string;
			}> = [];
			const text = jsonInput.trim();

			setStep("loading");

			// 0. Récupérer TOUS les mods en une seule requête pour rechercher en mémoire (ZÉRO RATE LIMIT)
			toast.loading("Fetching ModDB database for fast analysis...", {
				id: "import-search",
			});
			let allMods: Mod[] = [];
			try {
				allMods = await invoke<Mod[]>("fetch_mods", {
					options: { search: "", versions: [] },
				});
			} catch (e) {
				console.error("Could not fetch all mods. Matching might be limited.");
			}

			// 1. JSON Exporté classiquement
			if (text.startsWith("{") || text.startsWith("[")) {
				try {
					const parsed = importSchema.parse(JSON.parse(text));
					formattedMods = parsed.mods.map((m) => ({
						disabled: m.disabled ?? false,
						id: m.id.toString(),
						version: m.version,
					}));
				} catch (e) {
					console.error("Failed to parse standard JSON");
				}
			}

			// 2. Extraction des Noms de Fichiers ZIP copiés & Liens ModDB
			if (formattedMods.length === 0) {
				const extractedModsMap = new Map<
					string,
					{
						id: string;
						version: string;
						disabled: boolean;
						originalName?: string;
						apiId?: string;
					}
				>();

				// A) Liens ModDB
				const urlRegex =
					/mods\.vintagestory\.at\/(?:show\/mod\/(\d+)|([a-zA-Z0-9-_]+))/g;
				const linkMatches = [...text.matchAll(urlRegex)];

				for (const match of linkMatches) {
					const modid = match[1] || match[2];
					const matchedApiMod = allMods.find(
						(m) =>
							m.modid.toString() === modid ||
							m.urlalias === modid ||
							m.modidstrs.includes(modid),
					);
					if (matchedApiMod) {
						const stringId =
							matchedApiMod.modidstrs[0] ||
							matchedApiMod.urlalias ||
							matchedApiMod.modid.toString();
						if (!extractedModsMap.has(stringId)) {
							extractedModsMap.set(stringId, {
								apiId: matchedApiMod.modid.toString(),
								disabled: false,
								id: stringId,
								originalName: matchedApiMod.name,
								version: "Latest",
							});
						}
					}
				}

				// B) Noms de Fichiers ZIP (Méthode intelligente avec Scoring System)
				const zipRegex = /[^/\\]+\.zip/gi;
				const zipMatches = [...text.matchAll(zipRegex)];

				if (zipMatches.length > 0) {
					let currentProcessed = 0;

					for (const match of zipMatches) {
						currentProcessed++;
						const filename = match[0];

						// Vérification absolue en local
						const exactLocalMod = targetMods.find((tm) => {
							const tmFilename =
								tm.path.split(/[/\\]/).pop()?.toLowerCase() || "";
							return tmFilename === filename.toLowerCase();
						});

						if (exactLocalMod) {
							const stringId = exactLocalMod.modid.toString();
							if (!extractedModsMap.has(stringId)) {
								extractedModsMap.set(stringId, {
									disabled: false,
									id: stringId,
									originalName: exactLocalMod.name,
									version: exactLocalMod.version,
								});
							}
							continue;
						}

						// Nettoyage ultra-précis du nom de fichier
						let cleanName = filename.replace(/\.zip$/i, "");

						// Suppression stricte des versions du jeu (ex: 1.21.6, v1.20, VS1.21.1)
						cleanName = cleanName.replace(
							/[-_ ]*(?:vs|vintagestory)?[-_ ]*v?1\.(?:1[8-9]|2[0-9])(?:\.[0-9]+)?(?:-rc\.?[0-9]+)?/gi,
							"",
						);
						// Suppression du framework (ex: net8, net7)
						cleanName = cleanName.replace(/[-_ ]*net[0-9]+/i, "");

						let exactVersion: string | null = null;
						// Accepte les versions à 2 chiffres ou plus (ex: 1.0, 1.0.0, 2.0.0-dev.11)
						const versionRegex =
							/(?:[-_ \b]|^|v)([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[a-zA-Z0-9.]+)?)/gi;
						const versionMatches = [...cleanName.matchAll(versionRegex)];

						if (versionMatches.length > 0) {
							// Toujours prendre la DERNIÈRE occurrence, car la vraie version du mod est souvent à la fin
							const lastMatch = versionMatches[versionMatches.length - 1];
							exactVersion = lastMatch[1];
							let cutIdx = lastMatch.index;
							if (cutIdx !== undefined) {
								// Retirer les préfixes de version (v, -, _) juste avant la version coupée
								while (
									cutIdx > 0 &&
									["v", "V", "-", "_", " "].includes(cleanName[cutIdx - 1])
								) {
									cutIdx--;
								}
								cleanName = cleanName.substring(0, cutIdx);
							}
						}

						cleanName = cleanName.replace(/[-_]+/g, " ").trim();
						if (!cleanName) continue;

						const noSpaceClean = cleanName
							.replace(/[^a-z0-9]/gi, "")
							.toLowerCase();

						if (!noSpaceClean) continue;

						toast.loading(
							`Smart Search: Analyzing ${cleanName} (${currentProcessed}/${zipMatches.length})...`,
							{ id: "import-search" },
						);

						// --- Recherche en mémoire avec Scoring System ---
						let bestMatch: Mod | null = null;
						let bestScore = 0;

						for (const m of allMods) {
							const nameNoSpace = m.name
								.replace(/[^a-z0-9]/gi, "")
								.toLowerCase();
							const aliasNoSpace = (m.urlalias || "")
								.replace(/[^a-z0-9]/gi, "")
								.toLowerCase();
							const modidsNoSpace = m.modidstrs.map((id) =>
								id.replace(/[^a-z0-9]/gi, "").toLowerCase(),
							);

							let score = 0;

							// 1. Correspondance Parfaite
							if (
								nameNoSpace === noSpaceClean ||
								aliasNoSpace === noSpaceClean ||
								modidsNoSpace.includes(noSpaceClean)
							) {
								score = 100;
							}
							// 2. Inclusion de l'alias (ex: fotsacaninae contient caninae)
							else if (
								aliasNoSpace.length > 3 &&
								noSpaceClean.includes(aliasNoSpace)
							) {
								score = 80;
							}
							// 3. Inclusion du nom
							else if (
								nameNoSpace.length > 4 &&
								noSpaceClean.includes(nameNoSpace)
							) {
								score = 70;
							}
							// 4. L'inverse (ex: adventurerswalkingstick inclut walkingstick)
							else if (
								aliasNoSpace.length > 3 &&
								aliasNoSpace.includes(noSpaceClean)
							) {
								score = 60;
							} else if (
								nameNoSpace.length > 4 &&
								nameNoSpace.includes(noSpaceClean)
							) {
								score = 50;
							}

							if (score > bestScore) {
								bestScore = score;
								bestMatch = m;
							}

							if (bestScore === 100) break; // Inutile de chercher mieux
						}

						if (bestMatch && bestScore >= 50) {
							const stringId =
								bestMatch.modidstrs[0] ||
								bestMatch.urlalias ||
								bestMatch.modid.toString();
							if (!extractedModsMap.has(stringId)) {
								extractedModsMap.set(stringId, {
									apiId: bestMatch.modid.toString(),
									disabled: false,
									id: stringId,
									originalName: bestMatch.name,
									version: exactVersion || "Latest",
								});
							}
						} else {
							// Mod introuvable sur l'API (Offline / Local)
							const fakeId = `unknown-${Math.random().toString(36).substr(2, 9)}`;
							extractedModsMap.set(fakeId, {
								disabled: false,
								id: fakeId,
								originalName: filename.replace(/\.zip$/i, ""),
								version: exactVersion || "Unknown",
							});
						}
					}
					toast.dismiss("import-search");
				}

				formattedMods = Array.from(extractedModsMap.values());
			}

			if (formattedMods.length === 0) {
				toast.error("Could not extract any valid mods from the provided text.");
				setStep("input");
				return;
			}

			// --- ÉTAPE DE VÉRIFICATION FINALE ---
			const names: Record<string, string> = {};
			const verifiedMods: ParsedMod[] = [];
			let currentVerified = 0;
			const totalToVerify = formattedMods.length;

			for (const m of formattedMods) {
				currentVerified++;
				toast.loading(
					`Verifying ${m.originalName || m.id} (${currentVerified}/${totalToVerify})...`,
					{ id: "import-search" },
				);

				const tm = targetMods.find((t) => t.modid.toString() === m.id);
				let finalName = m.originalName || `Unknown Mod (ID: ${m.id})`;
				let apiAvail = false;
				let apiId: string | null = m.apiId || null;

				if (m.id.startsWith("unknown-")) {
					apiAvail = false;
					finalName = `❌ Not on ModDB: ${m.originalName}`;
				} else if (apiId) {
					apiAvail = true;
				} else {
					// Les mods provenant du JSON ont juste leur identifiant, on vérifie en mémoire
					const matchedApiMod = allMods.find(
						(am) =>
							am.modidstrs.includes(m.id) ||
							am.urlalias === m.id ||
							am.modid.toString() === m.id,
					);

					if (matchedApiMod) {
						finalName = matchedApiMod.name;
						apiAvail = true;
						apiId = matchedApiMod.modid.toString();
					} else {
						finalName = tm ? tm.name : `❌ Not on ModDB: ${m.id}`;
						apiAvail = false;
					}
				}

				names[m.id] = finalName;
				verifiedMods.push({
					apiAvailable: apiAvail,
					apiId,
					disabled: m.disabled,
					id: m.id,
					version: m.version,
				});
			}
			toast.dismiss("import-search");

			setModNames(names);
			setParsedMods(verifiedMods);

			// Tri des conflits
			const targetIds = new Set(targetMods.map((m) => m.modid.toString()));
			const newModsList = verifiedMods.filter((sm) => !targetIds.has(sm.id));
			const conflictsList = verifiedMods.filter((sm) => {
				const tm = targetMods.find((m) => m.modid.toString() === sm.id);
				return tm && tm.version !== sm.version;
			});

			setNewMods(newModsList);
			setConflicts(conflictsList);
			setSelectedNewMods(
				newModsList.filter((m) => m.apiAvailable).map((m) => m.id),
			);

			const initialResolutions: Record<string, "keep_target" | "use_imported"> =
				{};
			for (const c of conflictsList) {
				if (!c.apiAvailable) {
					initialResolutions[c.id] = "keep_target";
				} else {
					const tm = targetMods.find((m) => m.modid.toString() === c.id);
					if (tm) {
						initialResolutions[c.id] =
							compareSemverAsc(c.version, tm.version) > 0 ||
							c.version === "Latest"
								? "use_imported"
								: "keep_target";
					}
				}
			}
			setConflictResolutions(initialResolutions);

			setStep("review");
		} catch (e) {
			toast.error("An unexpected error occurred while parsing the input.");
			setStep("input");
		}
	};

	const { mutate: applyImport, isPending } = useMutation({
		mutationFn: async () => {
			let importedCount = 0;
			let current = 1;
			const totalToProcess =
				selectedNewMods.length +
				Object.values(conflictResolutions).filter((r) => r === "use_imported")
					.length;

			for (const modid of selectedNewMods) {
				const pm = parsedMods.find((m) => m.id === modid);
				if (!pm || !pm.apiAvailable || !pm.apiId) continue;

				const name = modNames[pm.id] || "Unknown";

				toast.loading(`Downloading ${name} (${current}/${totalToProcess})...`, {
					id: "apply-import",
				});

				try {
					await delay(400);
					const info = await invoke<ModInfo>("fetch_mod_info", {
						modid: pm.apiId,
					});

					let release = info.mod.releases[0];
					if (pm.version !== "Latest" && pm.version !== "Unknown") {
						const foundRelease = info.mod.releases.find(
							(r) => r.modversion === pm.version,
						);
						if (foundRelease) {
							release = foundRelease;
						} else {
							toast.warning(
								`Version ${pm.version} of ${info.mod.name} not found. Using latest (v${release.modversion}).`,
							);
						}
					}

					if (!release)
						throw new Error(`Release not found for mod ${info.mod.name}`);

					const destpath = `${installation.path}${pathDelimiter}Mods`;
					await invoke("download_and_maybe_extract", {
						destpath,
						emitevent: `import-smart-${modid}`,
						extract: false,
						url: release.mainfile,
					});

					await invoke("toggle_mod_state", {
						enable: !pm.disabled,
						modid: pm.id,
						path: installation.path,
						version: release.modversion,
					});
					importedCount++;
				} catch (e) {
					console.error("Failed to download mod", modid, e);
					toast.error(`Could not download ${name}. It might be offline-only.`);
				}
				current++;
			}

			for (const [modid, resolution] of Object.entries(conflictResolutions)) {
				if (resolution === "use_imported") {
					const pm = parsedMods.find((m) => m.id === modid);
					const tm = targetMods.find((m) => m.modid.toString() === modid);
					if (!pm || !tm || !pm.apiAvailable || !pm.apiId) continue;

					const name = modNames[pm.id] || "Unknown";

					toast.loading(`Updating ${name} (${current}/${totalToProcess})...`, {
						id: "apply-import",
					});

					try {
						await delay(400);
						const info = await invoke<ModInfo>("fetch_mod_info", {
							modid: pm.apiId,
						});

						let release = info.mod.releases[0];
						if (pm.version !== "Latest" && pm.version !== "Unknown") {
							const foundRelease = info.mod.releases.find(
								(r) => r.modversion === pm.version,
							);
							if (foundRelease) {
								release = foundRelease;
							} else {
								toast.warning(
									`Version ${pm.version} of ${info.mod.name} not found. Using latest (v${release.modversion}).`,
								);
							}
						}

						if (!release)
							throw new Error(`Release not found for mod ${info.mod.name}`);

						await invoke("remove_mod_from_installation", {
							params: { modpath: tm.path, path: installation.path },
						});

						const destpath = `${installation.path}${pathDelimiter}Mods`;
						await invoke("download_and_maybe_extract", {
							destpath,
							emitevent: `import-smart-${modid}`,
							extract: false,
							url: release.mainfile,
						});

						await invoke("toggle_mod_state", {
							enable: !pm.disabled,
							modid: pm.id,
							path: installation.path,
							version: release.modversion,
						});
						importedCount++;
					} catch (e) {
						console.error("Failed to update mod", modid, e);
						toast.error(`Could not update ${name}.`);
					}
					current++;
				}
			}
			return importedCount;
		},
		onError: (err) => {
			toast.dismiss("apply-import");
			toast.error(`Error importing mods: ${err}`);
		},
		onSuccess: (count) => {
			toast.dismiss("apply-import");
			if (count > 0) {
				toast.success(`Successfully imported/updated ${count} mod(s).`);
				queryClient.invalidateQueries({
					queryKey: installedModsQueryKey(installation.path),
				});
			} else {
				toast.success(`Mods verified successfully! No downloads needed.`);
			}
			closeDialog();
		},
	});

	const handleClose = () => {
		if (isPending || step === "loading") return;
		setStep("input");
		setJsonInput("");
		closeDialog();
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogClose />
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Smart Import Modlist</DialogTitle>
					<DialogDescription>
						Paste a <strong>JSON export</strong>, a list of{" "}
						<strong>.zip filenames</strong>, or <strong>ModDB links</strong>.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 mt-2">
					{step === "input" && (
						<div className="space-y-4">
							<Label>Paste Data Here</Label>
							<textarea
								className="w-full h-48 p-2 border rounded resize-none bg-background text-sm font-mono focus:outline-none"
								onChange={(e) => setJsonInput(e.target.value)}
								placeholder='{"mods":[{"id":"123","version":"1.0.0"}]} OR CarryOn-1.7.0.zip OR https://mods.vintagestory.at/...'
								value={jsonInput}
							/>
							<p className="text-xs text-muted-foreground">
								💡 <strong>Pro tip for Vanilla players</strong>: Go to your Mods
								folder, press <kbd>Ctrl+A</kbd> to select everything, then{" "}
								<kbd>Ctrl+Shift+C</kbd> (Copy as path). Paste it all right here!
							</p>
						</div>
					)}

					{step === "loading" && (
						<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
							<p className="animate-pulse">
								Analyzing text and querying database...
							</p>
						</div>
					)}

					{step === "review" && (
						<ScrollArea className="h-80 rounded-md border p-4 bg-muted/20">
							{newMods.length === 0 && conflicts.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">
									No new mods to import or update from this input.
								</p>
							) : (
								<div className="space-y-6">
									{newMods.length > 0 && (
										<div className="space-y-3">
											<h4 className="font-semibold text-sm border-b pb-1">
												New Mods to Download ({newMods.length})
											</h4>
											{newMods.map((mod) => (
												<div className="flex items-center gap-3" key={mod.id}>
													<Checkbox
														checked={selectedNewMods.includes(mod.id)}
														disabled={!mod.apiAvailable}
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
															{modNames[mod.id]}
														</span>
														<span className="text-xs text-muted-foreground">
															{mod.version !== "Latest" &&
															mod.version !== "Unknown"
																? `v${mod.version}`
																: mod.version === "Latest"
																	? "Latest Version"
																	: "Version Unknown"}{" "}
															{mod.disabled && "(Will be disabled)"}
															{!mod.apiAvailable && " - Cannot download"}
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
																{modNames[mod.id]}
															</span>
														</div>
														<Select
															disabled={!mod.apiAvailable}
															onValueChange={(val) => {
																if (!val) return;
																setConflictResolutions((prev) => ({
																	...prev,
																	[mod.id]: val as
																		| "keep_target"
																		| "use_imported",
																}));
															}}
															value={conflictResolutions[mod.id]}
														>
															<SelectTrigger className="w-56 shrink-0 h-8">
																{conflictResolutions[mod.id] === "keep_target"
																	? `Keep Current (v${targetMod.version})${!mod.apiAvailable ? " - Offline" : ""}`
																	: `Update to Imported (${mod.version === "Latest" ? "Latest" : `v${mod.version}`})`}
															</SelectTrigger>
															<SelectContent alignItemWithTrigger={false}>
																<SelectItem value="keep_target">
																	Keep Current (v{targetMod.version}){" "}
																	{!mod.apiAvailable && " - Offline"}
																</SelectItem>
																{mod.apiAvailable && (
																	<SelectItem value="use_imported">
																		Update to Imported (
																		{mod.version === "Latest"
																			? "Latest"
																			: `v${mod.version}`}
																		)
																	</SelectItem>
																)}
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
						<Button disabled={!jsonInput.trim()} onClick={handleSmartParse}>
							Process Input
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
								onClick={() => applyImport()}
							>
								{isPending ? "Applying..." : "Download & Apply"}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
