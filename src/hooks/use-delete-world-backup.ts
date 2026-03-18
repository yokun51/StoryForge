import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export const useDeleteWorldBackup = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (backupPath: string) =>
			invoke("delete_world_backup", { backupPath }),
		onError: (error, backupPath) => {
			toast.error(`Failed to delete backup: ${error.message}`, {
				id: `delete-backup-${backupPath}`,
			});
		},
		onMutate: (backupPath) => {
			toast.loading("Deleting backup...", {
				id: `delete-backup-${backupPath}`,
			});
		},
		onSuccess: async (_, backupPath) => {
			toast.success("Backup deleted successfully!", {
				id: `delete-backup-${backupPath}`,
			});
			await queryClient.invalidateQueries({ queryKey: ["world-backups"] });
			await queryClient.invalidateQueries({ queryKey: ["saves"] });
		},
	});
};
