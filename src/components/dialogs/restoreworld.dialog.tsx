import { format } from "date-fns";
import { HistoryIcon, RotateCcwIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeleteWorldBackup } from "@/hooks/use-delete-world-backup";
import { useRestoreWorld } from "@/hooks/use-restore-world";
import { useWorldBackups } from "@/hooks/use-world-backups";
import type { World } from "@/lib/types";
import { useDialogStore } from "@/stores/dialogs";

export type RestoreWorldDialogProps = {
	world: World;
};

export function RestoreWorldDialog({
	open,
	world,
}: { open: boolean } & RestoreWorldDialogProps) {
	const { closeDialog } = useDialogStore();
	const { data: backups, isLoading } = useWorldBackups(world.path, {
		enabled: open,
	});
	const { mutate: restoreWorld, isPending } = useRestoreWorld();
	const { mutate: deleteBackup, isPending: isDeleting } =
		useDeleteWorldBackup();

	const handleRestore = (backupPath: string) => {
		restoreWorld(
			{ backupPath, world },
			{
				onSuccess: () => {
					closeDialog();
				},
			},
		);
	};

	return (
		<Dialog
			onOpenChange={() => !isPending && !isDeleting && closeDialog()}
			open={open}
		>
			<DialogClose />
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<HistoryIcon className="size-5" />
						World Backups
					</DialogTitle>
					<DialogDescription>
						Select a backup to restore for{" "}
						<span className="text-warning-foreground font-medium">
							{world.data.world_name}
						</span>
						.
						<br />
						Warning: Restoring will overwrite your current world state!
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4">
					{isLoading ? (
						<p className="text-sm text-muted-foreground text-center py-4">
							Loading backups...
						</p>
					) : !backups || backups.length === 0 ? (
						<div className="text-center py-8 border rounded bg-muted/20">
							<p className="text-muted-foreground text-sm">
								No backups found for this world.
							</p>
						</div>
					) : (
						<ScrollArea className="h-64 rounded-md border p-4 bg-muted/10">
							<div className="space-y-3">
								{backups.map((backup) => {
									const date = new Date(backup.timestamp * 1000);
									return (
										<div
											className="flex items-center justify-between p-3 border rounded bg-background shadow-sm"
											key={backup.timestamp}
										>
											<div className="flex flex-col">
												<span className="font-medium text-sm">
													{format(date, "PPP 'at' p")}
												</span>
												<span className="text-xs text-muted-foreground font-mono">
													{backup.path.split(/[/\\]/).pop()}
												</span>
											</div>
											<div className="flex gap-2 items-center">
												<Button
													disabled={isPending || isDeleting}
													onClick={() => handleRestore(backup.path)}
													size="sm"
													variant="outline"
												>
													<RotateCcwIcon className="size-4 mr-2" />
													Restore
												</Button>
												<Button
													className="h-8 w-8"
													disabled={isPending || isDeleting}
													onClick={() => deleteBackup(backup.path)}
													size="icon"
													variant="destructive-outline"
												>
													<TrashIcon className="size-4" />
												</Button>
											</div>
										</div>
									);
								})}
							</div>
						</ScrollArea>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
