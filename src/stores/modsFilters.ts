import { create } from "zustand";
import type { ModTag } from "@/lib/types";

export type TargetVersionMode = "recommended" | "latest";

export type ModsFilters = {
	selectedGameVersions: string[];
	addGameVersion: (version: string) => void;
	removeGameVersion: (version: string) => void;
	removeAllGameVersions: () => void;
	selectedModTags: ModTag[];
	addModTag: (tag: ModTag) => void;
	removeModTag: (tag: ModTag) => void;
	removeAllModTags: () => void;
	searchText: string;
	setSearchText: (text: ModsFilters["searchText"]) => void;
	sortBy:
		| "created"
		| "name"
		| "trending"
		| "downloads"
		| "follows"
		| "comments"
		| "updated"
		| "status"
		| "locked";
	setSortBy: (key: ModsFilters["sortBy"]) => void;
	lastSortGlobal:
		| "created"
		| "name"
		| "trending"
		| "downloads"
		| "follows"
		| "comments"
		| "updated";
	lastSortInstalled: ModsFilters["sortBy"];
	orderDirection: "ascending" | "descending";
	setOrderDirection: (direction: ModsFilters["orderDirection"]) => void;
	author: string;
	setAuthor: (author: ModsFilters["author"]) => void;
	side: "any" | "client" | "server" | "both" | "installed";
	setSide: (side: ModsFilters["side"]) => void;
	category: "mod" | "externaltool" | "other";
	setCategory: (category: ModsFilters["category"]) => void;
	targetUpdateVersion: string;
	setTargetUpdateVersion: (version: string) => void;
	targetVersionMode: TargetVersionMode;
	setTargetVersionMode: (mode: TargetVersionMode) => void;
};

export const useModsFilters = create<ModsFilters>()((set) => ({
	addGameVersion: (version) =>
		set((state) => ({
			selectedGameVersions: [...state.selectedGameVersions, version],
		})),
	addModTag: (tag) =>
		set((state) => ({
			selectedModTags: [...state.selectedModTags, tag],
		})),
	author: "",
	category: "mod",
	lastSortGlobal: "trending",
	lastSortInstalled: "status",
	orderDirection: "ascending",
	removeAllGameVersions: () => set({ selectedGameVersions: [] }),
	removeAllModTags: () => set({ selectedModTags: [] }),
	removeGameVersion: (version) =>
		set((state) => ({
			selectedGameVersions: state.selectedGameVersions.filter(
				(v) => v !== version,
			),
		})),
	removeModTag: (tag) =>
		set((state) => ({
			selectedModTags: state.selectedModTags.filter((t) => t !== tag),
		})),
	searchText: "",
	selectedGameVersions: [],
	selectedModTags: [],
	setAuthor: (author) => set({ author }),
	setCategory: (category) => set({ category }),
	setOrderDirection: (direction) => set({ orderDirection: direction }),
	setSearchText: (text) => set({ searchText: text }),

	// Met à jour le side et restaure la bonne préférence de tri
	setSide: (side) =>
		set((state) => {
			if (side === "installed") {
				return { side, sortBy: state.lastSortInstalled };
			} else {
				return { side, sortBy: state.lastSortGlobal };
			}
		}),

	// Enregistre le tri dans la mémoire appropriée
	setSortBy: (key) =>
		set((state) => {
			if (state.side === "installed") {
				return { lastSortInstalled: key, sortBy: key };
			} else {
				return {
					lastSortGlobal: key as ModsFilters["lastSortGlobal"],
					sortBy: key,
				};
			}
		}),

	setTargetUpdateVersion: (version) => set({ targetUpdateVersion: version }),
	setTargetVersionMode: (mode) => set({ targetVersionMode: mode }),
	side: "any",
	sortBy: "trending",
	targetUpdateVersion: "",
	targetVersionMode: "recommended",
}));
