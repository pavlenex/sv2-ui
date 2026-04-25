import { Button } from '@/components/ui/button';

interface AddMinerTileProps {
  onClick: () => void;
}

/**
 * Tile that lives inside the "Point your miners to" section. Visually matches
 * the SV1/SV2 endpoint cards but offers an automatic onboarding path instead
 * of a copy-pasteable URL.
 */
export function AddMinerTile({ onClick }: AddMinerTileProps) {
  return (
    <div className="p-4 rounded-xl border border-dashed border-border bg-card/50 space-y-2 flex flex-col">
      <div className="font-semibold text-sm">Add a miner</div>
      <div className="text-xs text-muted-foreground">
        Scan your local network and have us point compatible miners at this dashboard automatically.
      </div>
      <div className="flex-1" />
      <Button size="sm" variant="default" onClick={onClick} className="w-full">
        Add miner
      </Button>
    </div>
  );
}
