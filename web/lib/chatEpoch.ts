import { onSessionChange } from "@/lib/session";

let epoch = 0;
onSessionChange(() => {
  epoch += 1;
});

/** Changes on every login/sign-out/401, so chat loads and streams of a previous user can be ignored. */
export function chatEpoch() {
  return epoch;
}
