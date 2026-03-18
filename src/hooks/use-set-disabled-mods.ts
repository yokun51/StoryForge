import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { disabledModsQueryKey } from "./use-disabled-mods";

export const useSetDisabledMods = (installationPath: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (disabledMods: string[]) =>
			invoke("set_disabled_mods", { disabledMods, path: installationPath }),
		onError: (error) => {
			toast.error(`Failed to apply mod profile: ${error.message}`);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: disabledModsQueryKey(installationPath),
			});
			toast.success("Mod profile applied successfully!");
		},
	});
};
