'use client';

import { DollarSign, Loader2, MapPin, Phone, Search } from 'lucide-react';
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

interface TwilioNumberSearchProps {
  onNumberSelect: (number: any) => void;
  selectedNumber: any;
}

interface PhoneNumber {
  number: string;
  friendlyName: string;
  locality: string;
  region: string;
  type: 'local' | 'toll-free' | 'mobile';
  price: string;
  capabilities: string[];
}

const mockNumbers: PhoneNumber[] = [
  {
    number: '+1 (555) 123-4567',
    friendlyName: '(555) 123-4567',
    locality: 'New York',
    region: 'NY',
    type: 'local',
    price: '$1.00',
    capabilities: ['Voice', 'SMS', 'MMS'],
  },
  {
    number: '+1 (555) 234-5678',
    friendlyName: '(555) 234-5678',
    locality: 'New York',
    region: 'NY',
    type: 'local',
    price: '$1.00',
    capabilities: ['Voice', 'SMS'],
  },
  {
    number: '+1 (800) 555-0123',
    friendlyName: '(800) 555-0123',
    locality: 'Toll Free',
    region: 'US',
    type: 'toll-free',
    price: '$2.00',
    capabilities: ['Voice', 'SMS', 'MMS'],
  },
  {
    number: '+1 (888) 555-0456',
    friendlyName: '(888) 555-0456',
    locality: 'Toll Free',
    region: 'US',
    type: 'toll-free',
    price: '$2.00',
    capabilities: ['Voice', 'SMS'],
  },
  {
    number: '+1 (555) 345-6789',
    friendlyName: '(555) 345-6789',
    locality: 'Los Angeles',
    region: 'CA',
    type: 'local',
    price: '$1.00',
    capabilities: ['Voice', 'SMS', 'MMS'],
  },
  {
    number: '+1 (555) 456-7890',
    friendlyName: '(555) 456-7890',
    locality: 'Chicago',
    region: 'IL',
    type: 'local',
    price: '$1.00',
    capabilities: ['Voice', 'SMS'],
  },
];

export function TwilioNumberSearch({
  onNumberSelect,
  selectedNumber,
}: TwilioNumberSearchProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchType, setSearchType] = React.useState('area-code');
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<PhoneNumber[]>([]);
  const [hasSearched, setHasSearched] = React.useState(false);

  const handleSearch = async () => {
    setIsSearching(true);
    setHasSearched(true);

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Filter numbers based on search
    let filtered = mockNumbers;
    if (searchQuery) {
      if (searchType === 'area-code') {
        filtered = mockNumbers.filter(
          (num) =>
            num.number.includes(searchQuery) ||
            num.friendlyName.includes(searchQuery)
        );
      } else if (searchType === 'city') {
        filtered = mockNumbers.filter((num) =>
          num.locality.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
    }

    setSearchResults(filtered);
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
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Choose Your Phone Number</h2>
        <p className="text-muted-foreground">
          Search and select a phone number for your call center.
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5" />
              <span className="font-medium">Search Available Numbers</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Search by</Label>
                <Select value={searchType} onValueChange={setSearchType}>
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
                    searchType === 'area-code' ? 'e.g., 555' : 'e.g., New York'
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Available Numbers ({searchResults.length})
              </h3>
              {searchResults.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Click a number to select it
                </p>
              )}
            </div>

            {isSearching ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Searching for available numbers...
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Phone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No numbers found for your search. Try a different area code
                    or city.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {searchResults.map((number, index) => (
                  <Card
                    key={index}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedNumber?.number === number.number
                        ? 'ring-2 ring-primary'
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
                                {number.type === 'toll-free'
                                  ? 'Toll-Free'
                                  : number.type}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {number.locality}, {number.region}
                              </div>
                              <div className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                {number.price}/month
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
                          {selectedNumber?.number === number.number && (
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
              <h3 className="text-lg font-semibold mb-2">
                Find Your Perfect Number
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Search for available phone numbers by area code or city. Choose
                from local numbers or toll-free options.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
