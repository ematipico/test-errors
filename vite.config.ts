import { defineConfig, type Plugin } from "vite";

const VIRTUAL_MODULE_ID = "virtual:my-module";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

function myPlugin(): Plugin {
  return {
    name: "my-plugin",

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return `export const msg = "hello from virtual module";`;
      }
    },

    transform(_code, id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        throw new Error("Transform error from my-plugin");
      }
    },
  };
}

export default defineConfig({
  plugins: [myPlugin()],
});
