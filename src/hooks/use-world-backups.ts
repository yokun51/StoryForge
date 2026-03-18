import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { WorldBackup } from "@/lib/types";

export const useWorldBackups = (
	worldPath: string,
	props?: Omit<
		UseQueryOptions<WorldBackup[], Error, WorldBackup[]>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		queryFn: () =>
			invoke("get_world_backups", { worldPath }) as Promise<WorldBackup[]>,
		queryKey: ["world-backups", worldPath],
		...props,
	});
