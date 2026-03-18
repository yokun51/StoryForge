import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderDownIcon, SaveIcon, TrashIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AuthorAutocomplete } from "@/components/auto-completes/author.auto-complete";
import { UpdateAllButton } from "@/components/buttons/update-all.button";
import { SearchInput } from "@/components/inputs";
import { ModList } from "@/components/lists/mod.list";
import { TextSwitch } from "@/components/switches/text.switch";
import SideToggleGroup from "@/components/tabs/side.tab";
import { Button } from "@/components/ui/button";
import { ErrorComponent } from "@/components/ui/error";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useDisabledMods } from "@/hooks/use-disabled-mods";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useLockedMods } from "@/hooks/use-locked-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import { useSetDisabledMods } from "@/hooks/use-set-disabled-mods";
import { gameVersionsQuery, modTagsQuery } from "@/lib/queries";
import { cn, compareSemverAsc, compareSemverDesc } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import {
	useInstallations,
	useInstallationsStore,
} from "@/stores/installations";
import { type ModsFilters, useModsFilters } from "@/stores/modsFilters";

export const Route = createFileRoute("/install-mods/$id")({
	component: RouteComponent,
	errorComponent: ErrorComponent,
	loader: async ({ params }) => {
		const rawInstallation = useInstallationsStore
			.getState()
			.installations.find((inst) => inst.id === Number(params.id));
		if (!rawInstallation) {
			throw new Error("Installation not found");
		}
		const installation = {
			...rawInstallation,
			name: rawInstallation.name?.trim() ?? "",
			path: rawInstallation.path?.trim() ?? "",
			version: rawInstallation.version?.trim() ?? "",
		};
		return { installation };
	},
});

const sortOptions: Record<ModsFilters["sortBy"], string> = {
	comments: "Comments",
	created: "Created",
	downloads: "Downloads",
	follows: "Follows",
	locked: "Locked Version (Updates Ignored)",
	name: "Name",
	status: "Status (Active/Inactive)",
	trending: "Trending",
	updated: "Last Updated",
};

const categoryOptions: Record<ModsFilters["category"], string> = {
	externaltool: "External Tool",
	mod: "Mod",
	other: "Other",
};

export type OutputMod = {
	modid: number;
	name: string;
	authors: string[];
	version: string;
	path: string;
};

function RouteComponent() {
	const { installation: loadedInstallation } = Route.useLoaderData();
	const { updateInstallation } = useInstallations();

	const installation =
		useInstallationsStore((s) =>
			s.installations.find((i) => i.id === loadedInstallation.id),
		) || loadedInstallation;

	const { openDialog } = useDialogStore();
	const { data: gameVersions } = useQuery(gameVersionsQuery);
	const { data: modTags } = useQuery(modTagsQuery);
	const { data: instMods } = useInstalledMods(installation.path, {
		staleTime: Infinity,
	});
	const { data: disabledMods } = useDisabledMods(installation.path);
	const { data: lockedModsData } = useLockedMods(installation.path);
	const { mutate: setDisabledMods } = useSetDisabledMods(installation.path);

	const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
		null,
	);

	const {
		selectedGameVersions,
		selectedModTags,
		removeGameVersion,
		addGameVersion,
		removeModTag,
		addModTag,
		searchText,
		setSearchText,
		sortBy,
		setSortBy,
		orderDirection,
		setOrderDirection,
		author,
		setAuthor,
		category,
		setCategory,
		side,
		targetUpdateVersion,
		setTargetUpdateVersion,
	} = useModsFilters();

	const lockedMods = lockedModsData || [];
	const actualTargetVersion = (
		targetUpdateVersion || installation.version
	).replace("-local", "");

	const { data: modUpdates } = useModUpdates(
		{
			installationId: installation.id,
			params:
				instMods?.mods?.map((mod) => `${mod.modid}@${mod.version}`).join(",") ??
				"",
		},
		{
			enabled: !!instMods?.mods?.length,
			staleTime: Infinity,
		},
	);

	let modsToUpdateCount = 0;
	if (modUpdates && instMods) {
		for (const [modid, update] of Object.entries(modUpdates.updates)) {
			const installed = instMods.mods.find(
				(m) =>
					m.modid.toString() === modid ||
					m.modid.toString() === update.modidstr,
			);
			if (!installed) continue;

			// Ignore les mods verrouillés
			if (lockedMods.includes(installed.modid.toString())) continue;

			const isCompatible = update.tags.some(
				(tag) => compareSemverAsc(tag, actualTargetVersion) <= 0,
			);

			if (isCompatible && installed.version !== update.modversion) {
				modsToUpdateCount++;
			}
		}
	}

	const parentRef = useRef<HTMLDivElement>(null);

	return (
		<div className="flex flex-col gap-2 w-full" style={{ height: "100vh" }}>
			<div className="flex gap-2 flex-wrap items-center h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
				<SearchInput
					className="h-9"
					onChange={(e) => setSearchText(e.target.value)}
					placeholder="Search mods..."
					value={searchText}
				/>
				<Select multiple value={selectedGameVersions}>
					<SelectTrigger className="w-40 h-9">
						<span
							className={cn(
								"pointer-events-none absolute start-1 z-10 block -translate-y-1/2 inline-flex text-muted-foreground px-2 transition-all",
								selectedGameVersions.length > 0
									? "top-0 bg-background text-xs"
									: "top-1/2 bg-transparent",
							)}
						>
							Game Version(s)
						</span>
						<SelectValue>
							{selectedGameVersions.length > 0
								? selectedGameVersions.length > 1
									? `${selectedGameVersions.length} versions`
									: selectedGameVersions[0]
								: null}
						</SelectValue>
					</SelectTrigger>
					<SelectContent align="start" alignItemWithTrigger={false}>
						{gameVersions?.sort(compareSemverDesc).map((version) => (
							<SelectItem
								key={version}
								onClick={() =>
									selectedGameVersions.includes(version)
										? removeGameVersion(version)
										: addGameVersion(version)
								}
								value={version}
							>
								{version}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select multiple value={selectedModTags}>
					<SelectTrigger className="w-40 h-9">
						<span
							className={cn(
								"pointer-events-none absolute start-1 z-10 block -translate-y-1/2 inline-flex text-muted-foreground px-2 transition-all",
								selectedModTags.length > 0
									? "top-0 bg-background text-xs"
									: "top-1/2 bg-transparent",
							)}
						>
							Mod Tag(s)
						</span>
						<SelectValue>
							{selectedModTags.length > 0
								? selectedModTags.length > 1
									? `${selectedModTags.length} tags`
									: selectedModTags[0].name
								: null}
						</SelectValue>
					</SelectTrigger>
					<SelectContent align="start" alignItemWithTrigger={false}>
						{modTags
							?.sort((a, b) => a.name.localeCompare(b.name))
							.map((tag) => (
								<SelectItem
									key={tag.tagid.toString()}
									onClick={() =>
										selectedModTags.includes(tag)
											? removeModTag(tag)
											: addModTag(tag)
									}
									value={tag}
								>
									{tag.name}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
				<div className="group relative">
					<Label className="bg-background text-muted-foreground pointer-events-none absolute start-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50">
						Sort by
					</Label>
					<Select
						onValueChange={(value) => setSortBy(value as ModsFilters["sortBy"])}
						value={sortBy}
					>
						<SelectTrigger>
							{sortBy
								? `${sortOptions[sortBy as keyof typeof sortOptions]}`
								: "Sort by"}
						</SelectTrigger>
						<SelectContent align="start" alignItemWithTrigger={false}>
							{Object.entries(sortOptions).map(([key, value]) => (
								<SelectItem key={key} value={key}>
									{value}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="group relative">
					<Label className="bg-background text-muted-foreground pointer-events-none absolute start-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50">
						Category
					</Label>
					<Select
						onValueChange={(value) =>
							setCategory(value as ModsFilters["category"])
						}
						value={category}
					>
						<SelectTrigger>
							{category
								? `${categoryOptions[category as keyof typeof categoryOptions]}`
								: "Category"}
						</SelectTrigger>
						<SelectContent align="start" alignItemWithTrigger={false}>
							{Object.entries(categoryOptions).map(([key, value]) => (
								<SelectItem key={key} value={key}>
									{value}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<TextSwitch
					checked={orderDirection === "descending"}
					onCheckedChange={(checked) =>
						setOrderDirection(checked ? "descending" : "ascending")
					}
					textChecked="Asc"
					textUnchecked="Desc"
				/>
				<AuthorAutocomplete
					onChange={(e) => setAuthor(e.target.value)}
					value={author}
				/>
				<SideToggleGroup />

				<div className="group relative">
					<Label className="bg-background text-muted-foreground pointer-events-none absolute start-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50">
						Target Version
					</Label>
					<Select
						onValueChange={(value) => setTargetUpdateVersion(value ?? "")}
						value={actualTargetVersion}
					>
						<SelectTrigger className="w-32 h-9">
							{actualTargetVersion}
						</SelectTrigger>
						<SelectContent align="start" alignItemWithTrigger={false}>
							{gameVersions?.sort(compareSemverDesc).map((version) => (
								<SelectItem key={version} value={version}>
									{version}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex items-center gap-2 border-l border-border pl-2 ml-1">
					<Select
						onValueChange={(val) =>
							setSelectedProfileId(val === "none" ? null : val)
						}
						value={selectedProfileId ?? "none"}
					>
						<SelectTrigger className="w-40 h-9">
							{selectedProfileId && selectedProfileId !== "none"
								? installation.modProfiles?.find(
										(p) => p.id === selectedProfileId,
									)?.name
								: "Mod Profiles"}
						</SelectTrigger>
						<SelectContent>
							{!installation.modProfiles ||
							installation.modProfiles.length === 0 ? (
								<p className="text-xs text-muted-foreground p-2">
									No profiles yet
								</p>
							) : (
								<>
									<SelectItem value="none">None</SelectItem>
									{installation.modProfiles.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.name}
										</SelectItem>
									))}
								</>
							)}
						</SelectContent>
					</Select>
					{selectedProfileId && selectedProfileId !== "none" && (
						<>
							<Button
								className="h-9"
								onClick={() => {
									const profile = installation.modProfiles?.find(
										(p) => p.id === selectedProfileId,
									);
									if (profile) setDisabledMods(profile.disabledMods);
								}}
								size="sm"
								variant="outline"
							>
								Apply
							</Button>
							<Button
								className="h-9"
								onClick={() => {
									updateInstallation({
										...installation,
										modProfiles: installation.modProfiles?.filter(
											(p) => p.id !== selectedProfileId,
										),
									});
									setSelectedProfileId(null);
									toast.success("Profile deleted");
								}}
								size="icon"
								variant="destructive-outline"
							>
								<TrashIcon className="size-4" />
							</Button>
						</>
					)}
					<Button
						className="h-9"
						onClick={() =>
							openDialog("SaveModProfileDialog", {
								disabledMods: disabledMods ?? [],
								installation,
							})
						}
						size="sm"
						variant="outline"
					>
						<SaveIcon className="size-4 mr-2" /> Save Profile
					</Button>
				</div>

				<Button
					className="h-9 ml-2"
					onClick={() => openDialog("ImportModsDialog", { installation })}
					variant="outline"
				>
					<FolderDownIcon className="w-4 h-4 mr-2" />
					Import Mods
				</Button>

				{side === "installed" && instMods && (
					<div className="flex items-center gap-3 ml-auto border-l border-border pl-3">
						<div className="flex flex-col text-right justify-center">
							<span className="text-xs font-medium">
								{instMods.mods.length} mod(s) installed
							</span>
							{modsToUpdateCount > 0 && (
								<span className="text-[10px] text-warning-foreground font-medium">
									{modsToUpdateCount} mod(s) to update
								</span>
							)}
						</div>
						{modUpdates && (
							<UpdateAllButton
								installation={installation}
								installedMods={instMods.mods}
								lockedMods={lockedMods}
								updates={modUpdates}
							/>
						)}
					</div>
				)}
			</div>
			<div className="h-full px-4 w-full overflow-hidden">
				<div
					className="w-full bg-card p-2 rounded shadow border relative h-full overflow-auto"
					ref={parentRef}
				>
					<ModList installation={installation} parentRef={parentRef} />
				</div>
			</div>
		</div>
	);
}
