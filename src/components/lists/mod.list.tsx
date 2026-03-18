import { useQuery } from "@tanstack/react-query";
import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { useDisabledMods } from "@/hooks/use-disabled-mods";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useLockedMods } from "@/hooks/use-locked-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";
import { ModItem } from "../items/mod.item";

type ModsParams = {
	versions: string[];
	search: string;
};

export type Mod = {
	modid: number;
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
	const {
		searchText,
		selectedModTags,
		selectedGameVersions,
		sortBy,
		orderDirection,
		author,
		side,
		category,
	} = useModsFilters();
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

	const modsList = mods
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
		?.filter((mod) => mod.type === category)
		?.filter((mod) =>
			side !== "installed"
				? side === "any"
					? true
					: mod.side === side
				: installedMods.some(
						(installedMod) =>
							installedMod.modid.toString() === mod.modid.toString() ||
							mod.modidstrs.includes(installedMod.modid.toString()) ||
							(mod.urlalias &&
								installedMod.modid.toString().toLowerCase() ===
									mod.urlalias.toLowerCase()) ||
							installedMod.name.toLowerCase() === mod.name.toLowerCase(),
					),
		)
		.sort((a, b) => {
			if (sortBy === "locked") {
				// Trouve l'id exact avec lequel le mod a été installé et potentiellement verrouillé
				const aInst = installedMods.find(
					(instMod) =>
						instMod.modid.toString() === a.modid.toString() ||
						a.modidstrs.includes(instMod.modid.toString()) ||
						(a.urlalias &&
							instMod.modid.toString().toLowerCase() ===
								a.urlalias.toLowerCase()) ||
						instMod.name.toLowerCase() === a.name.toLowerCase(),
				);
				const bInst = installedMods.find(
					(instMod) =>
						instMod.modid.toString() === b.modid.toString() ||
						b.modidstrs.includes(instMod.modid.toString()) ||
						(b.urlalias &&
							instMod.modid.toString().toLowerCase() ===
								b.urlalias.toLowerCase()) ||
						instMod.name.toLowerCase() === b.name.toLowerCase(),
				);

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
				const aInst = installedMods.find(
					(instMod) =>
						instMod.modid.toString() === a.modid.toString() ||
						a.modidstrs.includes(instMod.modid.toString()) ||
						(a.urlalias &&
							instMod.modid.toString().toLowerCase() ===
								a.urlalias.toLowerCase()) ||
						instMod.name.toLowerCase() === a.name.toLowerCase(),
				);
				const bInst = installedMods.find(
					(instMod) =>
						instMod.modid.toString() === b.modid.toString() ||
						b.modidstrs.includes(instMod.modid.toString()) ||
						(b.urlalias &&
							instMod.modid.toString().toLowerCase() ===
								b.urlalias.toLowerCase()) ||
						instMod.name.toLowerCase() === b.name.toLowerCase(),
				);

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

				// false = 0 (Activé), true = 1 (Désactivé)
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
							key={mod.modid}
							ref={rowVirtualizer.measureElement}
							style={{
								transform: `translateY(${item.start}px)`,
								willChange: "transform",
							}}
						>
							<ModItem
								installation={installation}
								installedMods={installedMods}
								mod={mod}
								modUpdates={modUpdates}
							/>
						</div>
					);
				})}
		</div>
	);
}
