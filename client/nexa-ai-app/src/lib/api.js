import { useAuth } from "@clerk/react";

export const useApi = () => {
    const { getToken } = useAuth();

    const apiFetch = async (url, options = {}) => {
        const token = await getToken();

        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });
    };

    return { apiFetch };
};