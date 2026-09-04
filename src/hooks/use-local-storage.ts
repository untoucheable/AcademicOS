"use client";

import { useEffect, useState } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on first render
  useEffect(() => {
    try {
      const item = localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item));
      }
    } catch (err) {
      console.error("Error reading localStorage key:", key, err);
    } finally {
      setLoaded(true);
    }
  }, [key]);

  // Save to localStorage whenever value changes
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (err) {
      console.error("Error writing localStorage key:", key, err);
    }
  }, [key, storedValue]);

  const setValue = (value: T | ((prev: T) => T)) => {
    setStoredValue((prev) =>
      typeof value === "function" ? (value as (p: T) => T)(prev) : value
    );
  };

  return [storedValue, setValue, loaded];
}
