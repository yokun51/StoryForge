import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppFolder } from "@/hooks/use-app-folder";
import { makeStringFolderSafe } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import {
	type Installation,
	useInstallationsStore,
} from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

export type DuplicateInstallationDialogProps = {
	installation: Installation;
};

export function DuplicateInstallationDialog({
	open,
	installation,
}: {
	open: boolean;
} & DuplicateInstallationDialogProps) {
	const { closeDialog } = useDialogStore();
	const { installationsParent } = useSettingsStore();
	const { appFolder } = useAppFolder();
	const { addInstallation } = useInstallationsStore();

	const { mutateAsync: duplicateFolder, isPending } = useMutation({
		mutationFn: async (newName: string) => {
			const safeName = makeStringFolderSafe(newName);
			const oldSafeName = makeStringFolderSafe(installation.name);
			return (await invoke("duplicate_installations_folder", {
				newName: safeName,
				oldSafeName,
				source: installationsParent ?? appFolder ?? "",
			})) as string;
		},
		onError: (error) => {
			toast.error(`Error duplicating installation: ${error}`);
		},
		onMutate: () => {
			toast.loading("Duplicating installation... This may take a while.", {
				id: "duplicate",
			});
		},
		onSuccess: (newPath, newName) => {
			toast.success("Installation duplicated successfully", {
				id: "duplicate",
			});
			addInstallation(
				{
					...installation,
					favorite: false,
					id: Date.now(),
					index: Date.now(),
					lastTimePlayed: 0,
					name: newName,
					path: newPath,
					totalTimePlayed: 0,
				},
				(status) => status && closeDialog(),
			);
		},
	});

	const form = useForm({
		defaultValues: {
			name: `${installation.name} - copy`,
		},
		onSubmit: async ({ value }) => {
			await duplicateFolder(value.name);
		},
		validators: {
			onChange: z.object({
				name: z.string().min(1, "Name is required"),
			}),
		},
	});

	return (
		<Dialog onOpenChange={() => !isPending && closeDialog()} open={open}>
			<DialogClose />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Duplicate Installation</DialogTitle>
					<DialogDescription>
						Choose a name for the duplicated installation.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 mt-4">
					<form.Field name="name">
						{(field) => (
							<div className="grid gap-2">
								<Label htmlFor="name">New Name</Label>
								<Input
									id="name"
									onChange={(e) => field.handleChange(e.target.value)}
									onKeyUp={(e) => {
										if (e.key === "Enter") {
											form.handleSubmit();
										}
									}}
									value={field.state.value}
								/>
								{field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-xs">
										{field.state.meta.errors[0]?.toString()}
									</p>
								)}
							</div>
						)}
					</form.Field>
					<Button
						className="w-full"
						disabled={isPending || !form.state.isFormValid}
						onClick={() => form.handleSubmit()}
					>
						{isPending ? "Duplicating..." : "Duplicate"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
