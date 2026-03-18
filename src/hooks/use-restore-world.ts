import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { World } from "@/lib/types";

export const useRestoreWorld = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ world, backupPath }: { world: World; backupPath: string }) =>
			invoke("restore_world_backup", {
				backupPath,
				worldPath: world.path,
			}),
		onError: (error) => {
			toast.error(`Failed to restore backup: ${error.message}`);
		},
		onMutate: () => {
			toast.loading("Restoring backup...");
		},
		onSuccess: async () => {
			toast.success("World successfully restored from backup!");
			await queryClient.invalidateQueries({ queryKey: ["saves"] });
		},
	});
};
