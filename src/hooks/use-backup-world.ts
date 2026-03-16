import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { World } from "@/lib/types";

export const useBackupWorld = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (world: World) =>
			invoke("backup_world", { worldPath: world.path }) as Promise<string>,
		onError: (error, world) => {
			toast.error(
				`Failed to backup ${world.data.world_name}: ${error.message}`,
			);
		},
		onMutate: (world) => {
			toast.loading(`Creating backup for ${world.data.world_name}...`, {
				id: `backup-${world.path}`,
			});
		},
		onSuccess: (_, world) => {
			toast.success(`Backup created safely!`, {
				description: "Stored in the 'Backups' folder inside your installation.",
				id: `backup-${world.path}`,
			});
			queryClient.invalidateQueries({ queryKey: ["saves"] });
		},
	});
};
