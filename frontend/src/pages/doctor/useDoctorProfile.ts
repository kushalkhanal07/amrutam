import { useQuery } from '@tanstack/react-query';
import { doctorsApi } from '@/lib/api/endpoints';
import { isHttpError } from '@/lib/api/client';

/** The signed-in doctor's profile; `missing` is true until they create it. */
export function useDoctorProfile() {
  const query = useQuery({
    queryKey: ['doctors', 'me'],
    queryFn: doctorsApi.me,
    retry: false,
  });
  const missing = query.isError && isHttpError(query.error, 404);
  return { ...query, missing };
}
