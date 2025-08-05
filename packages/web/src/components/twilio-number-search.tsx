'use client';

import { Loader2, MapPin, Phone, Search } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';

interface TwilioNumberSearchProps {
  onNumberSelect: (number: any) => void;
  selectedNumber: any;
}

interface PhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  postalCode: string | null;
  capabilities: string[];
  type: 'local';
  price: string;
}

export function TwilioNumberSearch({
  onNumberSelect,
  selectedNumber,
}: TwilioNumberSearchProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchType, setSearchType] = React.useState<'area-code' | 'city'>(
    'area-code'
  );
  const [isSearching, setIsSearching] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<PhoneNumber[]>([]);

  const trpc = useTRPC();
  const { data, refetch } = useQuery(
    trpc.onboarding.searchAvailableNumbers.queryOptions({
      country: 'US',
      areaCode: searchQuery,
    })
  );

  console.log({ data });

  const handleSearch = async () => {
    setIsSearching(true);
    setHasSearched(true);
    const { data = [] } = await refetch();
    console.log({ data });

    const results: PhoneNumber[] = data.map((num: any) => ({
      phoneNumber: num.phoneNumber,
      friendlyName: num.friendlyName,
      locality: num.locality,
      region: num.region,
      postalCode: num.postalCode ?? null,
      capabilities: Object.entries(num.capabilities || {})
        .filter(([, enabled]) => enabled)
        .map(([key]) => key.toUpperCase()),
      type: 'local',
      price: '$1.00',
    }));

    setSearchResults(results);
    setIsSearching(false);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'local':
        return 'bg-blue-100 text-blue-800';
      case 'toll-free':
        return 'bg-green-100 text-green-800';
      case 'mobile':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6 px-5">
      <Card className="border-2 border-dashed border-muted-foreground/25">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Phone className="w-4 h-4 text-primary" />
            </div>
            <span className="font-medium">Choose Your Phone Number</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Search and select a phone number for your call center.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Search by</Label>
              <Select
                value={searchType}
                onValueChange={(val) =>
                  setSearchType(val as 'area-code' | 'city')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="area-code">Area Code</SelectItem>
                  <SelectItem value="city">City</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="search">
                {searchType === 'area-code' ? 'Area Code' : 'City Name'}
              </Label>
              <Input
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  searchType === 'area-code' ? 'e.g., 857' : 'e.g., Dorchester'
                }
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                disabled={isSearching}
                className="w-full"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {hasSearched && (
        <div className="space-y-4 mx-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">
              Available Numbers ({searchResults.length})
            </h4>
            {searchResults.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Click a number to select it
              </p>
            )}
          </div>

          {isSearching ? (
            <Card>
              <CardContent className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Searching for available numbers...
                </p>
              </CardContent>
            </Card>
          ) : searchResults.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Phone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No numbers found for your search. Try a different area code or
                  city.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 max-h-80 overflow-y-auto px-5 py-2">
              {searchResults.map((number, index) => (
                <Card
                  key={index}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedNumber === number.phoneNumber
                      ? 'ring-2 ring-primary bg-primary/5'
                      : ''
                  }`}
                  onClick={() => onNumberSelect(number)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Phone className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-lg">
                              {number.friendlyName}
                            </span>
                            <Badge className={getTypeColor(number.type)}>
                              {number.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {number.locality && `${number.locality}, `}{' '}
                              {number.region}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex gap-1 mb-1">
                          {number.capabilities.map((cap) => (
                            <Badge
                              key={cap}
                              variant="outline"
                              className="text-xs"
                            >
                              {cap}
                            </Badge>
                          ))}
                        </div>
                        {selectedNumber === number.phoneNumber && (
                          <Badge className="bg-green-100 text-green-800">
                            Selected
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {!hasSearched && (
        <Card>
          <CardContent className="text-center py-12">
            <Phone className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h4 className="text-lg font-semibold mb-2">
              Find Your Perfect Number
            </h4>
            <p className="text-muted-foreground max-w-md mx-auto">
              Search for available phone numbers by area code or city. Choose
              from local numbers or toll-free options.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
