import { AppLink } from "../product/session";
import { useTitle } from "../product/ui";

export default function NotFound() {
  useTitle("Not found");
  return (
    <div className="page stack">
      <p className="kicker">404</p>
      <h1>This page is not on the board</h1>
      <AppLink className="btn-signal" to="/board">
        Back to the board
      </AppLink>
    </div>
  );
}
