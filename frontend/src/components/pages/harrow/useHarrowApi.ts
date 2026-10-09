import { useCallback } from 'react';
import { useSnackbar } from 'notistack';
import api from '../../../utils/api';
import { getErrorMessage } from '../../../utils/apiErrors';

/**
 * POST helper shared by every Harrow mutation: reports success or the server's
 * error message through a snackbar and tells the caller whether it worked.
 */
export const useHarrowApi = () => {
  const { enqueueSnackbar } = useSnackbar();

  const post = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      successMessage: string | null,
      failureMessage: string
    ): Promise<boolean> => {
      try {
        await api.post(path, body);
        if (successMessage) {
          enqueueSnackbar(successMessage, { variant: 'success' });
        }
        return true;
      } catch (err) {
        enqueueSnackbar(getErrorMessage(err, failureMessage), { variant: 'error' });
        return false;
      }
    },
    [enqueueSnackbar]
  );

  return { post, enqueueSnackbar };
};
