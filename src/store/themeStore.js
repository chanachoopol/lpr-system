import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useThemeStore = create(
  persist(
    (set) => ({
      theme: 'light', // ค่าเริ่มต้นเป็น Light Mode
      toggleTheme: () => 
        set((state) => ({ 
          theme: state.theme === 'light' ? 'dark' : 'light' 
        })),
    }),
    {
      name: 'theme-storage', // ชื่อ Key ที่จะเซฟลงใน localStorage
    }
  )
)