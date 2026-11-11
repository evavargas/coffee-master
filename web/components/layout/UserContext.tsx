"use client";

import { createContext, useContext } from "react";

/** The signed-in user's first name, provided by the app shell so screens do not fetch the user again. */
const UserNameContext = createContext<string | null>(null);

export const UserNameProvider = UserNameContext.Provider;
export const useUserName = () => useContext(UserNameContext);
