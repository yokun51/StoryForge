import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDialogStore } from "@/stores/dialogs";
import { type Installation, useInstallations } from "@/stores/installations";

export type SaveModProfileDialogProps = {
	installation: Installation;
	disabledMods: string[];
	prefilledName?: string;
};

export function SaveModProfileDialog({
	open,
	installation,
	disabledMods,
	prefilledName = "",
}: { open: boolean } & SaveModProfileDialogProps) {
	const { closeDialog } = useDialogStore();
	const { updateInstallation } = useInstallations();

	const form = useForm({
		defaultValues: { name: prefilledName },
		onSubmit: ({ value }) => {
			const existingIndex = (installation.modProfiles || []).findIndex(
				(p) => p.name.toLowerCase() === value.name.trim().toLowerCase(),
			);

			const updatedProfiles = [...(installation.modProfiles || [])];

			if (existingIndex >= 0) {
				// Met à jour le profil existant
				updatedProfiles[existingIndex] = {
					...updatedProfiles[existingIndex],
					disabledMods: [...disabledMods],
				};
			} else {
				// Crée un nouveau profil
				const newProfile = {
					disabledMods: [...disabledMods],
					id: Date.now().toString(),
					name: value.name.trim(),
				};
				updatedProfiles.push(newProfile);
			}

			updateInstallation(
				{
					...installation,
					modProfiles: updatedProfiles,
				},
				(status) => {
					if (status) {
						toast.success(`Mod profile '${value.name}' saved!`);
						closeDialog();
					}
				},
			);
		},
		validators: {
			onChange: z.object({
				name: z.string().trim().min(1, "Profile name is required"),
			}),
		},
	});

	return (
		<Dialog onOpenChange={() => closeDialog()} open={open}>
			<DialogClose />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Save Mod Profile</DialogTitle>
					<DialogDescription>
						Give a name to your current configuration of enabled/disabled mods.
						If you use an existing profile name, it will be updated.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<form.Field name="name">
						{(field) => (
							<div className="grid gap-2">
								<Label htmlFor="name">Profile Name</Label>
								<Input
									id="name"
									onChange={(e) => field.handleChange(e.target.value)}
									onKeyUp={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											form.handleSubmit();
										}
									}}
									placeholder="e.g. Hardcore Survival"
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
				</div>

				<DialogFooter>
					<Button onClick={() => closeDialog()} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={!form.state.isFormValid}
						onClick={() => form.handleSubmit()}
					>
						Save Profile
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
