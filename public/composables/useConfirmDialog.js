import { ref } from "vue";

const state = ref({
  open: false,
  title: "Confirm",
  message: "",
  confirmLabel: "OK",
  cancelLabel: "Cancel",
  variant: "primary",
  resolver: null
});

function confirm({ title = "Confirm", message, confirmLabel = "OK", cancelLabel = "Cancel", variant = "primary" }) {
  return new Promise((resolve) => {
    state.value = { open: true, title, message, confirmLabel, cancelLabel, variant, resolver: resolve };
  });
}

function respond(result) {
  const resolver = state.value.resolver;
  state.value = { ...state.value, open: false, resolver: null };
  if (resolver) resolver(result);
}

export function useConfirmDialog() {
  return { state, confirm, respond };
}
