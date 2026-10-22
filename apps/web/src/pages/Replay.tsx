import { ReplayPage } from "../features/replay/ReplayPage";

export default function Replay({ demo = false }: { demo?: boolean }) {
  return <ReplayPage demo={demo} />;
}
