import { createSlice, nanoid } from "@reduxjs/toolkit";

const notificationSlice = createSlice({
  name: "notifications",
  initialState: [],
  reducers: {
    addNotification: {
      reducer: (state, action) => {
        state.push(action.payload);
      },
      prepare: ({ type, message }) => ({
        payload: {
          id: nanoid(),
          type,
          message,
        },
      }),
    },

    removeNotification: (state, action) => {
      return state.filter((n) => n.id !== action.payload);
    },

    clearNotifications: () => [],
  },
});

export const {
  addNotification,
  removeNotification,
  clearNotifications,
} = notificationSlice.actions;

export default notificationSlice.reducer;
