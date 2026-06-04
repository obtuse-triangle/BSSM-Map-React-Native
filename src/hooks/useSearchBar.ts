import { useMemo, useState } from 'react'

import campusDataUntyped from '../data/campus-wgs84.json'
import type { CampusGeoJSON } from '../types/geojson'
import { getInteractiveFeatures } from '../utils/geoJsonHelpers'

const campusData = campusDataUntyped as unknown as CampusGeoJSON

export function useSearchBar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  const searchableFeatures = useMemo(() => getInteractiveFeatures(campusData), [])

  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return []
    }
    return searchableFeatures.filter((feature) => {
      const searchableLabel = `${feature.properties.name} ${feature.properties.name_ko}`.toLowerCase()
      return searchableLabel.includes(normalizedQuery)
    })
  }, [searchQuery, searchableFeatures])

  const handleClear = () => {
    setSearchQuery('')
  }

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearchFocused,
    setIsSearchFocused,
    handleClear,
  }
}
