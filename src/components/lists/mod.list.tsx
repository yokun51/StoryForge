import { useQuery, useQueryClient } from "@tanstack/react-query";
import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import {
	CheckSquareIcon,
	DownloadCloudIcon,
	LockIcon,
	TrashIcon,
	UnlockIcon,
	XSquareIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogClose,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useDisabledMods } from "@/hooks/use-disabled-mods";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useLockedMods } from "@/hooks/use-locked-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import type { ModInfo } from "@/lib/types";
import { getTargetRelease, pathDelimiter } from "@/lib/utils";
import type { OutputMod } from "@/routes/install-mods/$id";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";
import { ModItem } from "../items/mod.item";

type ModsParams = {
	versions: string[];
	search: string;
};

export type Mod = {
	modid: number | string;
	assetid: number;
	downloads: number;
	follows: number;
	trendingpoints: number;
	comments: number;
	name: string;
	summary: string;
	modidstrs: string[];
	author: string;
	urlalias: string | null;
	side: string;
	type: string;
	logo: string | null;
	tags: string[];
	lastreleased: string;
};

const modsQuery = (params: ModsParams) => ({
	keepPreviousData: true,
	queryFn: () => invoke("fetch_mods", { options: params }) as Promise<Mod[]>,
	queryKey: ["mods", params],
	refetchOnWindowFocus: false,
});

export function ModList({
	parentRef,
	installation,
}: {
	parentRef: React.RefObject<HTMLDivElement | null>;
	installation: Installation;
}) {
	const queryClient = useQueryClient();

	const {
		searchText,
		selectedModTags,
		selectedGameVersions,
		sortBy,
		orderDirection,
		author,
		side,
		category,
		targetVersionMode,
	} = useModsFilters();

	const actualTargetVersion = (
		installation?.targetVersion ||
		installation?.version ||
		""
	).replace("-local", "");

	const { data: mods } = useQuery(
		modsQuery({
			search: searchText,
			versions: selectedGameVersions.map((version) => version),
		}),
	);

	const { data: instMods } = useInstalledMods(installation.path);
	const installedMods = instMods?.mods ?? [];
	const { data: disabledModsData } = useDisabledMods(installation.path);
	const disabledModsList = disabledModsData || [];
	const { data: lockedModsData } = useLockedMods(installation.path);
	const lockedModsList = lockedModsData || [];

	const { data: modUpdates } = useModUpdates(
		{
			installationId: installation.id,
			params:
				installedMods?.map((mod) => `${mod.modid}@${mod.version}`).join(",") ??
				"",
		},
		{
			enabled: !!installedMods.length,
		},
	);

	// Optimisation : Création d'une Map O(1) des mods installés
	// Prend en charge le mode hors-ligne. (Utilisation de toString() pour éviter le bug NaN des mods locaux)
	const installedModMap = useMemo(() => {
		const map = new Map<string, OutputMod>();
		if (installedMods.length === 0) return map;

		for (const inst of installedMods) {
			map.set(inst.modid.toString(), inst);
		}

		if (mods) {
			for (const mod of mods) {
				const inst = installedMods.find(
					(instMod) =>
						instMod.modid.toString() === mod.modid.toString() ||
						mod.modidstrs.includes(instMod.modid.toString()) ||
						(mod.urlalias &&
							instMod.modid.toString().toLowerCase() ===
								mod.urlalias.toLowerCase()) ||
						instMod.name.toLowerCase() === mod.name.toLowerCase(),
				);
				if (inst) {
					map.set(mod.modid.toString(), inst);
				}
			}
		}
		return map;
	}, [mods, installedMods]);

	// Génère la liste de base : mixe les données API (si en ligne) et les données Locales (hors-ligne)
	const baseModsList = useMemo(() => {
		if (side !== "installed") {
			return mods || [];
		}

		return installedMods.map((instMod) => {
			const apiMod = mods?.find(
				(mod) =>
					instMod.modid.toString() === mod.modid.toString() ||
					mod.modidstrs.includes(instMod.modid.toString()) ||
					(mod.urlalias &&
						instMod.modid.toString().toLowerCase() ===
							mod.urlalias.toLowerCase()) ||
					instMod.name.toLowerCase() === mod.name.toLowerCase(),
			);

			if (apiMod) return apiMod;

			return {
				assetid: Number(instMod.modid) || 0,
				author: instMod.authors?.[0] || "Unknown",
				comments: 0,
				downloads: 0,
				follows: 0,
				lastreleased: new Date(0).toISOString(),
				logo: null,
				modid: instMod.modid.toString(),
				modidstrs: [instMod.modid.toString()],
				name: instMod.name,
				side: "both",
				summary: "Local/Offline mod",
				tags: [],
				trendingpoints: 0,
				type: "mod",
				urlalias: null,
			} as Mod;
		});
	}, [mods, installedMods, side]);

	// Filtres et Tri
	const modsList = useMemo(() => {
		return baseModsList
			?.filter((mod) => {
				if (side === "installed" && searchText) {
					const searchLower = searchText.toLowerCase();
					return (
						mod.name.toLowerCase().includes(searchLower) ||
						mod.author.toLowerCase().includes(searchLower) ||
						mod.summary.toLowerCase().includes(searchLower)
					);
				}
				return true;
			})
			?.filter((mod) => {
				if (selectedModTags.length > 0) {
					return selectedModTags.every((tag) => mod.tags.includes(tag.name));
				}
				return true;
			})
			?.filter((mod) => {
				if (author) {
					return mod.author.toLowerCase().includes(author.toLowerCase());
				}
				return true;
			})
			?.filter((mod) => {
				if (side === "installed" && !mods) return true; // Sécurité hors-ligne
				return mod.type === category;
			})
			?.filter((mod) =>
				side !== "installed"
					? side === "any"
						? true
						: mod.side === side
					: true,
			)
			.sort((a, b) => {
				if (sortBy === "locked") {
					const aInst = installedModMap.get(a.modid.toString());
					const bInst = installedModMap.get(b.modid.toString());

					const aLocked =
						aInst && lockedModsList.includes(aInst.modid.toString()) ? 1 : 0;
					const bLocked =
						bInst && lockedModsList.includes(bInst.modid.toString()) ? 1 : 0;

					if (aLocked !== bLocked) {
						return orderDirection === "descending"
							? bLocked - aLocked
							: aLocked - bLocked;
					}
					if (orderDirection === "descending") {
						return b.name.localeCompare(a.name);
					}
					return a.name.localeCompare(b.name);
				}

				if (sortBy === "status") {
					const aInst = installedModMap.get(a.modid.toString());
					const bInst = installedModMap.get(b.modid.toString());

					const aDisabled =
						!aInst ||
						disabledModsList.some(
							(d) =>
								d === aInst.modid.toString() || d.startsWith(`${aInst.modid}@`),
						);
					const bDisabled =
						!bInst ||
						disabledModsList.some(
							(d) =>
								d === bInst.modid.toString() || d.startsWith(`${bInst.modid}@`),
						);

					const aVal = aDisabled ? 1 : 0;
					const bVal = bDisabled ? 1 : 0;

					if (aVal !== bVal) {
						return orderDirection === "descending" ? bVal - aVal : aVal - bVal;
					}
					if (orderDirection === "descending") {
						return b.name.localeCompare(a.name);
					}
					return a.name.localeCompare(b.name);
				}

				if (sortBy === "name") {
					if (orderDirection === "descending") {
						return b.name.localeCompare(a.name);
					}
					return a.name.localeCompare(b.name);
				}
				if (sortBy === "updated") {
					if (orderDirection === "descending") {
						return (
							new Date(b.lastreleased).getTime() -
							new Date(a.lastreleased).getTime()
						);
					}
					return (
						new Date(a.lastreleased).getTime() -
						new Date(b.lastreleased).getTime()
					);
				}
				if (sortBy === "downloads") {
					if (orderDirection === "descending") {
						return a.downloads - b.downloads;
					}
					return b.downloads - a.downloads;
				}
				if (sortBy === "follows") {
					if (orderDirection === "descending") {
						return a.follows - b.follows;
					}
					return b.follows - a.follows;
				}
				if (sortBy === "trending") {
					if (orderDirection === "descending") {
						return a.trendingpoints - b.trendingpoints;
					}
					return b.trendingpoints - a.trendingpoints;
				}
				if (sortBy === "comments") {
					if (orderDirection === "descending") {
						return a.comments - b.comments;
					}
					return b.comments - a.comments;
				}

				if (orderDirection === "descending") {
					return 0;
				}
				return -1;
			});
	}, [
		baseModsList,
		searchText,
		selectedModTags,
		author,
		category,
		side,
		mods,
		installedModMap,
		sortBy,
		orderDirection,
		lockedModsList,
		disabledModsList,
	]);

	// ======= MULTI-SELECTION STATE =======
	const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const allSelected =
		modsList && modsList.length > 0 && selectedMods.size === modsList.length;

	const handleSelectAll = () => {
		if (allSelected) {
			setSelectedMods(new Set());
		} else {
			setSelectedMods(new Set(modsList?.map((m) => m.modid.toString()) || []));
		}
	};

	const toggleSelection = (modid: string) => {
		setSelectedMods((prev) => {
			const next = new Set(prev);
			if (next.has(modid)) next.delete(modid);
			else next.add(modid);
			return next;
		});
	};

	// ======= BATCH ACTIONS =======
	const handleBulkEnable = async (enable: boolean) => {
		const targets = Array.from(selectedMods)
			.map((id) => installedModMap.get(id))
			.filter(Boolean) as OutputMod[];

		if (targets.length === 0)
			return toast.info("No installed mods selected to enable/disable.");

		toast.loading(
			`${enable ? "Enabling" : "Disabling"} ${targets.length} mods...`,
			{ id: "bulk-enable" },
		);
		try {
			for (const inst of targets) {
				await invoke("toggle_mod_state", {
					enable,
					modid: inst.modid.toString(),
					path: installation.path,
					version: inst.version,
				});
			}
			await queryClient.invalidateQueries({
				queryKey: ["disabled-mods", installation.path],
			});
			toast.success(
				`Successfully ${enable ? "enabled" : "disabled"} ${targets.length} mods.`,
				{ id: "bulk-enable" },
			);
		} catch (e) {
			toast.error(`Error: ${e}`, { id: "bulk-enable" });
		}
	};

	const handleBulkLock = async (lock: boolean) => {
		const targets = Array.from(selectedMods)
			.map((id) => installedModMap.get(id))
			.filter(Boolean) as OutputMod[];

		if (targets.length === 0)
			return toast.info("No installed mods selected to lock/unlock.");

		toast.loading(
			`${lock ? "Locking" : "Unlocking"} ${targets.length} mods...`,
			{ id: "bulk-lock" },
		);
		try {
			for (const inst of targets) {
				await invoke("toggle_mod_lock", {
					lock,
					modid: inst.modid.toString(),
					path: installation.path,
				});
			}
			await queryClient.invalidateQueries({
				queryKey: ["locked-mods", installation.path],
			});
			toast.success(
				`Successfully ${lock ? "locked" : "unlocked"} ${targets.length} mods.`,
				{ id: "bulk-lock" },
			);
		} catch (e) {
			toast.error(`Error: ${e}`, { id: "bulk-lock" });
		}
	};

	const handleBulkDelete = async () => {
		const targets = Array.from(selectedMods)
			.map((id) => installedModMap.get(id))
			.filter(Boolean) as OutputMod[];

		if (targets.length === 0) {
			toast.info("No installed mods selected to delete.");
			return setIsDeleteDialogOpen(false);
		}

		toast.loading(`Deleting ${targets.length} mods...`, { id: "bulk-delete" });
		try {
			for (const inst of targets) {
				await invoke("remove_mod_from_installation", {
					params: { modpath: inst.path, path: installation.path },
				});
			}
			await queryClient.invalidateQueries({
				queryKey: ["installationMods", installation.path],
			});
			setSelectedMods(new Set());
			toast.success(`Successfully deleted ${targets.length} mods.`, {
				id: "bulk-delete",
			});
		} catch (e) {
			toast.error(`Error deleting mods: ${e}`, { id: "bulk-delete" });
		}
		setIsDeleteDialogOpen(false);
	};

	const handleBulkSyncOrInstall = async () => {
		const selectedIds = Array.from(selectedMods);
		if (selectedIds.length === 0) return;

		toast.loading(`Checking versions for ${selectedIds.length} mods...`, {
			id: "bulk-sync",
		});
		let processedCount = 0;

		try {
			for (const id of selectedIds) {
				const inst = installedModMap.get(id);
				const isInstalled = !!inst;

				if (isInstalled && lockedModsList.includes(id)) continue;

				try {
					const modInfo = (await invoke("fetch_mod_info", {
						modid: id,
					})) as ModInfo;

					const targetRelease = getTargetRelease(
						modInfo.mod.releases,
						actualTargetVersion,
						targetVersionMode,
					);

					if (!targetRelease) continue;

					if (!isInstalled || targetRelease.modversion !== inst.version) {
						processedCount++;
						toast.loading(`Processing ${modInfo.mod.name}...`, {
							id: "bulk-sync",
						});

						if (isInstalled) {
							await invoke("remove_mod_from_installation", {
								params: { modpath: inst.path, path: installation.path },
							});
						}

						await invoke("download_and_maybe_extract", {
							destpath: `${installation.path}${pathDelimiter}Mods`,
							emitevent: `bulk-sync-${id}`,
							extract: false,
							url: targetRelease.mainfile,
						});
					}
				} catch (err) {
					console.warn(`Could not process mod ${id} (possibly local):`, err);
				}
			}

			await queryClient.invalidateQueries({
				queryKey: ["installationMods", installation.path],
			});
			await queryClient.invalidateQueries({
				queryKey: ["modUpdates", installation.id],
			});

			if (processedCount > 0) {
				toast.success(`Successfully processed ${processedCount} mod(s).`, {
					id: "bulk-sync",
				});
			} else {
				toast.success(`Selected mods are already synced, locked, or local.`, {
					id: "bulk-sync",
				});
			}
		} catch (e) {
			toast.error(`Error processing mods: ${e}`, { id: "bulk-sync" });
		}
	};

	const estimateSize = useCallback(() => 81, []);

	const rowVirtualizer = useVirtualizer({
		count: modsList?.length || 0,
		estimateSize,
		getScrollElement: () => parentRef.current,
		measureElement,
		overscan: 20,
	});

	const items = rowVirtualizer.getVirtualItems();
	const totalSize = rowVirtualizer.getTotalSize();

	return (
		<>
			{/* Non-Sticky Bulk Action Header */}
			<div className="flex items-center gap-4 px-4 py-2.5 -mt-2 -mx-2 mb-2 border-b bg-card min-h-[50px]">
				<div className="flex items-center gap-2 shrink-0">
					<Checkbox
						checked={allSelected}
						id="select-all"
						onCheckedChange={handleSelectAll}
					/>
					<Label
						className="text-sm font-medium cursor-pointer select-none"
						htmlFor="select-all"
					>
						{selectedMods.size > 0
							? `${selectedMods.size} selected`
							: "Select All"}
					</Label>
				</div>
				{selectedMods.size > 0 && (
					<div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
						<Button
							onClick={() => handleBulkSyncOrInstall()}
							size="sm"
							variant="outline"
						>
							<DownloadCloudIcon className="w-4 h-4 mr-2" /> Sync / Install
						</Button>
						<Button
							onClick={() => handleBulkEnable(true)}
							size="sm"
							variant="outline"
						>
							<CheckSquareIcon className="w-4 h-4 mr-2 text-success" /> Enable
						</Button>
						<Button
							onClick={() => handleBulkEnable(false)}
							size="sm"
							variant="outline"
						>
							<XSquareIcon className="w-4 h-4 mr-2 text-destructive" /> Disable
						</Button>
						<Button
							onClick={() => handleBulkLock(true)}
							size="sm"
							variant="outline"
						>
							<LockIcon className="w-4 h-4 mr-2" /> Lock
						</Button>
						<Button
							onClick={() => handleBulkLock(false)}
							size="sm"
							variant="outline"
						>
							<UnlockIcon className="w-4 h-4 mr-2" /> Unlock
						</Button>
						<Button
							onClick={() => setIsDeleteDialogOpen(true)}
							size="sm"
							variant="destructive"
						>
							<TrashIcon className="w-4 h-4 mr-2" /> Delete
						</Button>
					</div>
				)}
			</div>

			<div
				className="relative"
				style={{
					height: totalSize,
				}}
			>
				{modsList &&
					items.map((item) => {
						const mod = modsList[item.index];
						return (
							<div
								className="not-last:border-b flex gap-2 absolute top-0 left-0 w-full"
								data-index={item.index}
								key={mod.modid.toString()}
								ref={rowVirtualizer.measureElement}
								style={{
									transform: `translateY(${item.start}px)`,
									willChange: "transform",
								}}
							>
								<ModItem
									installation={installation}
									installedMods={installedMods}
									isSelected={selectedMods.has(mod.modid.toString())}
									mod={mod}
									modUpdates={modUpdates}
									onSelect={() => toggleSelection(mod.modid.toString())}
								/>
							</div>
						);
					})}
			</div>

			{/* Bulk Delete Confirmation Dialog */}
			<AlertDialog
				onOpenChange={setIsDeleteDialogOpen}
				open={isDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete {selectedMods.size} mods from the
							installation{" "}
							<span className="font-bold">{installation.name}</span>. Only
							downloaded/installed mods will be affected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogClose render={<Button variant="outline" />}>
							Cancel
						</AlertDialogClose>
						<Button onClick={handleBulkDelete} variant="destructive">
							Delete {selectedMods.size} Mods
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
