import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { SearchInput } from "@/components/inputs";
import { WorldList } from "@/components/lists/world.list";
import { ErrorComponent } from "@/components/ui/error";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { useSaves } from "@/hooks/use-saves";
import { cn } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";

export const Route = createFileRoute("/worlds")({
	component: RouteComponent,
	errorComponent: ErrorComponent,
	validateSearch: z.object({
		installationId: z.number().optional().catch(undefined),
	}),
});

function RouteComponent() {
	const search = Route.useSearch();

	const [searchText, setSearchText] = useState("");
	const [selectedInstallationId, setSelectedInstallationId] = useState<
		number | null
	>(search.installationId ?? null);

	const { installations } = useInstallations();

	const { data: worlds } = useSaves();
	const filteredWorlds = worlds?.filter((world) => {
		const matchesSearchText = world.data.world_name
			.toLowerCase()
			.includes(searchText.toLowerCase());
		const matchesInstallation = selectedInstallationId
			? installations.find(
					(installation) =>
						installation.path.split(/[/\\]/).pop() === world.installation_name,
				)?.id === selectedInstallationId
			: true;
		return matchesSearchText && matchesInstallation;
	});

	return (
		<div
			className="grid grid-rows-[min-content_1fr] gap-2 w-full"
			style={{ height: "100vh" }}
		>
			<div className="flex gap-2 flex-wrap items-center h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
				<SearchInput
					onChange={(e) => setSearchText(e.target.value)}
					placeholder="Search worlds..."
					value={searchText}
				/>
				<Select
					onValueChange={(val) =>
						setSelectedInstallationId(val === "all" ? null : Number(val))
					}
					value={selectedInstallationId?.toString() || "all"}
				>
					<SelectTrigger
						className={cn(
							"w-46",
							selectedInstallationId ? "" : "text-muted-foreground",
						)}
					>
						{selectedInstallationId
							? `${installations.find((installation) => installation.id === selectedInstallationId)?.name}`
							: "All installations"}
					</SelectTrigger>
					<SelectContent alignItemWithTrigger={false}>
						<SelectItem value="all">All installations</SelectItem>
						{installations.map((installation) => (
							<SelectItem
								key={installation.id}
								value={installation.id.toString()}
							>
								{installation.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{filteredWorlds && (
				<div className="h-full px-4 relative overflow-auto w-full">
					<WorldList worlds={filteredWorlds} />
				</div>
			)}
		</div>
	);
}
