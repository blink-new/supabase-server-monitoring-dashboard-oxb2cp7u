import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, ChevronDown, Filter, X, Search, SortAsc, SortDesc } from 'lucide-react'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { cn } from '@/lib/utils'
import { AnalyticsFilters } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'

interface AdvancedFiltersProps {
  filters: AnalyticsFilters
  onFiltersChange: (filters: AnalyticsFilters) => void
  availableImeis?: string[]
  className?: string
}

export function AdvancedFilters({ 
  filters, 
  onFiltersChange, 
  availableImeis = [], 
  className 
}: AdvancedFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [availableExceptionTypes, setAvailableExceptionTypes] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({
    from: filters.dateRange?.start,
    to: filters.dateRange?.end
  })

  // Load available exception types
  useEffect(() => {
    const loadExceptionTypes = async () => {
      const { data } = await supabase
        .from('correlation_logs')
        .select('exception_type')
        .not('exception_type', 'is', null)

      if (data) {
        const types = [...new Set(data.map(d => d.exception_type).filter(Boolean))]
        setAvailableExceptionTypes(types)
      }
    }

    loadExceptionTypes()
  }, [])

  const handleDateRangeChange = useCallback((range: { from?: Date; to?: Date }) => {
    setDateRange(range)
    if (range.from && range.to) {
      onFiltersChange({
        ...filters,
        dateRange: {
          start: startOfDay(range.from),
          end: endOfDay(range.to)
        }
      })
    } else if (!range.from && !range.to) {
      const { dateRange, ...filtersWithoutDate } = filters
      onFiltersChange(filtersWithoutDate)
    }
  }, [filters, onFiltersChange])

  const handleSearchChange = useCallback((value: string) => {
    if (value.trim()) {
      onFiltersChange({ ...filters, searchQuery: value.trim() })
    } else {
      const { searchQuery, ...filtersWithoutSearch } = filters
      onFiltersChange(filtersWithoutSearch)
    }
  }, [filters, onFiltersChange])

  const handleImeiToggle = useCallback((imei: string, checked: boolean) => {
    const currentImeis = filters.imeis || []
    let newImeis: string[]

    if (checked) {
      newImeis = [...currentImeis, imei]
    } else {
      newImeis = currentImeis.filter(i => i !== imei)
    }

    if (newImeis.length > 0) {
      onFiltersChange({ ...filters, imeis: newImeis })
    } else {
      const { imeis, ...filtersWithoutImeis } = filters
      onFiltersChange(filtersWithoutImeis)
    }
  }, [filters, onFiltersChange])

  const handleSeverityToggle = useCallback((severity: string, checked: boolean) => {
    const currentSeverities = filters.severityLevels || []
    let newSeverities: string[]

    if (checked) {
      newSeverities = [...currentSeverities, severity]
    } else {
      newSeverities = currentSeverities.filter(s => s !== severity)
    }

    if (newSeverities.length > 0) {
      onFiltersChange({ ...filters, severityLevels: newSeverities })
    } else {
      const { severityLevels, ...filtersWithoutSeverity } = filters
      onFiltersChange(filtersWithoutSeverity)
    }
  }, [filters, onFiltersChange])

  const handleExceptionTypeToggle = useCallback((type: string, checked: boolean) => {
    const currentTypes = filters.exceptionTypes || []
    let newTypes: string[]

    if (checked) {
      newTypes = [...currentTypes, type]
    } else {
      newTypes = currentTypes.filter(t => t !== type)
    }

    if (newTypes.length > 0) {
      onFiltersChange({ ...filters, exceptionTypes: newTypes })
    } else {
      const { exceptionTypes, ...filtersWithoutTypes } = filters
      onFiltersChange(filtersWithoutTypes)
    }
  }, [filters, onFiltersChange])

  const handleSortChange = useCallback((field: string, direction: 'asc' | 'desc') => {
    onFiltersChange({
      ...filters,
      sortBy: {
        field,
        direction,
        secondary: filters.sortBy?.secondary
      }
    })
  }, [filters, onFiltersChange])

  const handleSecondarySortChange = useCallback((field: string, direction: 'asc' | 'desc') => {
    onFiltersChange({
      ...filters,
      sortBy: {
        ...filters.sortBy!,
        secondary: { field, direction }
      }
    })
  }, [filters, onFiltersChange])

  const clearAllFilters = useCallback(() => {
    onFiltersChange({})
    setDateRange({ from: undefined, to: undefined })
  }, [onFiltersChange])

  const setQuickDateRange = useCallback((days: number) => {
    const end = new Date()
    const start = subDays(end, days)
    handleDateRangeChange({ from: start, to: end })
  }, [handleDateRangeChange])

  // Count active filters
  const activeFilterCount = [
    filters.dateRange ? 1 : 0,
    filters.imeis?.length || 0,
    filters.severityLevels?.length || 0,
    filters.exceptionTypes?.length || 0,
    filters.searchQuery ? 1 : 0,
    filters.ignitionStatus && filters.ignitionStatus !== 'all' ? 1 : 0,
    filters.sortBy ? 1 : 0
  ].reduce((sum, count) => sum + count, 0)

  return (
    <Card className={className}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Advanced Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeFilterCount} active
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearAllFilters()
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                )}
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  isExpanded && "transform rotate-180"
                )} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Search */}
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search exceptions, IMEIs, or messages..."
                  value={filters.searchQuery || ''}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="flex flex-wrap gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        !dateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} -{" "}
                            {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={handleDateRangeChange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>

                {/* Quick date range buttons */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickDateRange(1)}
                >
                  Last 24h
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickDateRange(7)}
                >
                  Last 7d
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickDateRange(30)}
                >
                  Last 30d
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* IMEI Selection */}
              {availableImeis.length > 0 && (
                <div className="space-y-2">
                  <Label>IMEIs ({availableImeis.length})</Label>
                  <div className="max-h-32 overflow-y-auto space-y-2 border rounded-md p-2">
                    {availableImeis.map((imei) => (
                      <div key={imei} className="flex items-center space-x-2">
                        <Checkbox
                          id={`imei-${imei}`}
                          checked={filters.imeis?.includes(imei) || false}
                          onCheckedChange={(checked) => 
                            handleImeiToggle(imei, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={`imei-${imei}`}
                          className="text-sm font-mono cursor-pointer"
                        >
                          {imei}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Severity Levels */}
              <div className="space-y-2">
                <Label>Severity Levels</Label>
                <div className="space-y-2">
                  {['critical', 'warning', 'info'].map((severity) => (
                    <div key={severity} className="flex items-center space-x-2">
                      <Checkbox
                        id={`severity-${severity}`}
                        checked={filters.severityLevels?.includes(severity) || false}
                        onCheckedChange={(checked) => 
                          handleSeverityToggle(severity, checked as boolean)
                        }
                      />
                      <Label
                        htmlFor={`severity-${severity}`}
                        className="text-sm capitalize cursor-pointer"
                      >
                        {severity}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exception Types */}
              {availableExceptionTypes.length > 0 && (
                <div className="space-y-2">
                  <Label>Exception Types ({availableExceptionTypes.length})</Label>
                  <div className="max-h-32 overflow-y-auto space-y-2 border rounded-md p-2">
                    {availableExceptionTypes.map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={`type-${type}`}
                          checked={filters.exceptionTypes?.includes(type) || false}
                          onCheckedChange={(checked) => 
                            handleExceptionTypeToggle(type, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={`type-${type}`}
                          className="text-sm cursor-pointer"
                        >
                          {type}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sorting */}
            <div className="space-y-4">
              <Label>Sorting</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Primary Sort</Label>
                  <div className="flex gap-2">
                    <Select
                      value={filters.sortBy?.field || ''}
                      onValueChange={(field) => 
                        handleSortChange(field, filters.sortBy?.direction || 'desc')
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Sort by..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created_at">Date</SelectItem>
                        <SelectItem value="imei">IMEI</SelectItem>
                        <SelectItem value="exception_type">Exception Type</SelectItem>
                        <SelectItem value="correlation_result">Result</SelectItem>
                      </SelectContent>
                    </Select>
                    {filters.sortBy?.field && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => 
                          handleSortChange(
                            filters.sortBy!.field,
                            filters.sortBy!.direction === 'asc' ? 'desc' : 'asc'
                          )
                        }
                      >
                        {filters.sortBy.direction === 'asc' ? (
                          <SortAsc className="h-4 w-4" />
                        ) : (
                          <SortDesc className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {filters.sortBy?.field && (
                  <div className="space-y-2">
                    <Label className="text-sm">Secondary Sort</Label>
                    <div className="flex gap-2">
                      <Select
                        value={filters.sortBy?.secondary?.field || ''}
                        onValueChange={(field) => 
                          handleSecondarySortChange(field, filters.sortBy?.secondary?.direction || 'desc')
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Then by..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="created_at">Date</SelectItem>
                          <SelectItem value="imei">IMEI</SelectItem>
                          <SelectItem value="exception_type">Exception Type</SelectItem>
                          <SelectItem value="correlation_result">Result</SelectItem>
                        </SelectContent>
                      </Select>
                      {filters.sortBy?.secondary?.field && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => 
                            handleSecondarySortChange(
                              filters.sortBy!.secondary!.field,
                              filters.sortBy!.secondary!.direction === 'asc' ? 'desc' : 'asc'
                            )
                          }
                        >
                          {filters.sortBy.secondary.direction === 'asc' ? (
                            <SortAsc className="h-4 w-4" />
                          ) : (
                            <SortDesc className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Ignition Status */}
            <div className="space-y-2">
              <Label>Ignition Status</Label>
              <Select
                value={filters.ignitionStatus || 'all'}
                onValueChange={(value: 'on' | 'off' | 'all') => {
                  if (value === 'all') {
                    const { ignitionStatus, ...filtersWithoutIgnition } = filters
                    onFiltersChange(filtersWithoutIgnition)
                  } else {
                    onFiltersChange({ ...filters, ignitionStatus: value })
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="on">Ignition ON</SelectItem>
                  <SelectItem value="off">Ignition OFF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}