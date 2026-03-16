import { apiClient } from './client'
import type {
  ScreenerRequest,
  ScreenerResponse,
  SymbolSearchRequest,
  SymbolSearchResponse,
} from '@/types/screener'

export const screenerApi = {
  analyze: async (params: ScreenerRequest): Promise<ScreenerResponse> => {
    const response = await apiClient.post<ScreenerResponse>('/screener/analyze', params)
    return response.data
  },

  searchSymbols: async (params: SymbolSearchRequest): Promise<SymbolSearchResponse> => {
    const response = await apiClient.post<SymbolSearchResponse>('/screener/symbols', params)
    return response.data
  },
}
