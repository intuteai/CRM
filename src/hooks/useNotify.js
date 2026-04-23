import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { addNotification } from '../features/notifications/notificationSlice';

export function useNotify() {
  const dispatch = useDispatch();
  const notifySuccess = useCallback((message) => dispatch(addNotification({ type: 'success', message })), [dispatch]);
  const notifyError   = useCallback((message) => dispatch(addNotification({ type: 'error',   message })), [dispatch]);
  const notifyInfo    = useCallback((message) => dispatch(addNotification({ type: 'info',    message })), [dispatch]);
  const notifyWarning = useCallback((message) => dispatch(addNotification({ type: 'warning', message })), [dispatch]);
  return { notifySuccess, notifyError, notifyInfo, notifyWarning };
}
