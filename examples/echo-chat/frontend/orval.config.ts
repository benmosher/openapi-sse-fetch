import { defineConfig } from "orval";

export default defineConfig({
  echoChat: {
    input: "./openapi.json",
    output: {
      target: "./src/generated/orval/index.ts",
      client: "react-query",
      httpClient: "fetch",
    },
  },
});
