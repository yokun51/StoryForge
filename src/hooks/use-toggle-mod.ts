import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { disabledModsQueryKey } from "./use-disabled-mods";

export const useToggleMod = (installationPath: string) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			modid,
			version,
			enable,
		}: {
			modid: string;
			version: string;
			enable: boolean;
		}) =>
			invoke("toggle_mod_state", {
				enable,
				modid,
				path: installationPath,
				version,
			}),
		onError: (error) => {
			toast.error(`Failed to toggle mod: ${error.message}`);
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: disabledModsQueryKey(installationPath),
			});
			if (variables.enable) {
				toast.success("Mod enabled");
			} else {
				toast.info("Mod disabled");
			}
		},
	});
};
