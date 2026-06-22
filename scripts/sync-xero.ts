import { syncAll } from "../src/lib/sync";

syncAll()
  .then(() => {
    console.log("sync complete");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
