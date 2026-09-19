import { createSlice } from "@reduxjs/toolkit";

// Start from the saved login so a page refresh renders the current route as the signed-in user.
// Starting empty made every route bounce to "/" (and then to the dashboard) on the first render.
const loadStoredAuth = () => {
  try {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (token && role) {
      return { userRole: role, userName: localStorage.getItem("name"), token };
    }
  } catch {
    // localStorage unavailable — fall through to signed out
  }
  return { userRole: null, userName: null, token: null };
};

const initialState = {
  ...loadStoredAuth(),
  showLogin: false,
  socketStatus: "idle", // 'idle' | 'connected' | 'error'
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuth: (state, action) => {
      const { userRole, userName, token } = action.payload;
      state.userRole = userRole;
      state.userName = userName;
      state.token = token;
    },
    logout: (state) => {
      state.userRole = null;
      state.userName = null;
      state.token = null;
      state.showLogin = false;
      state.socketStatus = "idle";
    },
    toggleLogin: (state, action) => {
      state.showLogin = action.payload;
    },
    setSocketStatus: (state, action) => {
      state.socketStatus = action.payload;
    },
  },
});

export const { setAuth, logout, toggleLogin, setSocketStatus } = authSlice.actions;

export default authSlice.reducer;
