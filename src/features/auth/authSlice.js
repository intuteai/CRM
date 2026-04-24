import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  userRole: null,
  userName: null,
  token: null,
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
