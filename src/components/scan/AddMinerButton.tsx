import { Button } from '@/components/ui/button';

interface AddMinerButtonProps {
  onClick: () => void;
}

export function AddMinerButton({ onClick }: AddMinerButtonProps) {
  return (
    <Button size="sm" variant="default" onClick={onClick}>
      Add miner
    </Button>
  );
}
