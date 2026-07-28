import { create } from "zustand";
import {
  getAuthTokenStorageKey,
  setApiAccessTokenGetter,
  setApiUnauthorizedHandler,
} from "../api/apiClient";

type AuthState = {
  accessToken: string | null;
  isAuthenticated: boolean;
  setAccessToken: (accessToken: string) => void;
  clearAuth: () => void;
};

const authTokenStorageKey = getAuthTokenStorageKey();

function readStoredAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(authTokenStorageKey);
}

function storeAccessToken(accessToken: string) {
  window.localStorage.setItem(authTokenStorageKey, accessToken);
}

function removeStoredAccessToken() {
  window.localStorage.removeItem(authTokenStorageKey);
}

const initialAccessToken = readStoredAccessToken();

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: initialAccessToken,
  isAuthenticated: initialAccessToken !== null,

  setAccessToken: (accessToken) => {
    storeAccessToken(accessToken);
    set({ accessToken, isAuthenticated: true });
  },

  clearAuth: () => {
    removeStoredAccessToken();
    set({ accessToken: null, isAuthenticated: false });
  },
}));

setApiAccessTokenGetter(() => useAuthStore.getState().accessToken);
setApiUnauthorizedHandler(() => useAuthStore.getState().clearAuth());

export function getCurrentAccessToken() {
  return useAuthStore.getState().accessToken;
}
