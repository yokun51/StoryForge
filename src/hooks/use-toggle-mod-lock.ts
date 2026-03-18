import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { lockedModsQueryKey } from "./use-locked-mods";

export const useToggleModLock = (installationPath: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ modid, lock }: { modid: string; lock: boolean }) =>
			invoke("toggle_mod_lock", {
				lock,
				modid,
				path: installationPath,
			}),
		onError: (error) => {
			toast.error(`Failed to toggle mod lock: ${error.message}`);
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: lockedModsQueryKey(installationPath),
			});
			if (variables.lock) {
				toast.success("Mod version locked (Ignored from updates)");
			} else {
				toast.info("Mod version unlocked");
			}
		},
	});
};
