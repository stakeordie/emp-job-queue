'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Archive,
  Trash2,
  Search,
  Calendar,
  User,
  DollarSign,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface Collection {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
  price: number;
  editions: number;
  cover_image_url: string;
  miniapp_cover_image: string;
  project_id: string;
  _count: {
    miniapp_generation: number;
  };
  generations: {
    id: string;
    status: string;
    created_at: string;
    job_id: string;
  }[];
}

interface JobStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filteredCollections, setFilteredCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadCollections();
  }, []);

  useEffect(() => {
    const filtered = collections.filter(collection =>
      collection.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collection.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collection.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredCollections(filtered);
  }, [collections, searchTerm]);

  const loadCollections = async () => {
    try {
      const response = await fetch('/api/collections');
      if (response.ok) {
        const data = await response.json();
        setCollections(data.collections || []);
      } else {
        console.error('Failed to load collections');
      }
    } catch (error) {
      console.error('Error loading collections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveCollection = async (collectionId: string) => {
    setActionLoading(collectionId);
    try {
      const response = await fetch(`/api/collections/${collectionId}/archive`, {
        method: 'POST',
      });
      if (response.ok) {
        await loadCollections();
      } else {
        console.error('Failed to archive collection');
      }
    } catch (error) {
      console.error('Error archiving collection:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    if (!confirm('Are you sure you want to delete this collection? This action cannot be undone.')) {
      return;
    }

    setActionLoading(collectionId);
    try {
      const response = await fetch(`/api/collections/${collectionId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await loadCollections();
      } else {
        console.error('Failed to delete collection');
      }
    } catch (error) {
      console.error('Error deleting collection:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const calculateJobStats = (generations: Collection['generations']): JobStats => {
    const stats = { total: 0, completed: 0, failed: 0, pending: 0, processing: 0 };

    generations.forEach(gen => {
      stats.total++;
      switch (gen.status.toLowerCase()) {
        case 'completed':
        case 'success':
          stats.completed++;
          break;
        case 'failed':
        case 'error':
          stats.failed++;
          break;
        case 'pending':
        case 'queued':
          stats.pending++;
          break;
        case 'processing':
        case 'running':
          stats.processing++;
          break;
      }
    });

    return stats;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'archived': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading collections...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Collections</h1>
        <p className="text-gray-600">
          Manage collections, view job usage, and control availability
        </p>
      </div>

      <div className="mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search collections by title, description, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <Button onClick={loadCollections} variant="outline">
            <Search className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {filteredCollections.map((collection) => {
          const jobStats = calculateJobStats(collection.generations);
          const isExpanded = expandedCollection === collection.id;

          return (
            <Card key={collection.id} className={collection.archived ? 'opacity-75' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-lg">{collection.title || 'Untitled'}</CardTitle>
                      <Badge className={getStatusColor(collection.status)}>
                        {collection.status}
                      </Badge>
                      {collection.archived && (
                        <Badge variant="secondary">
                          <Archive className="h-3 w-3 mr-1" />
                          Archived
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      {collection.description || 'No description'}
                    </CardDescription>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDate(collection.created_at)}
                      </span>
                      {collection.price && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          ${collection.price}
                        </span>
                      )}
                      {collection.editions && (
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {collection.editions} editions
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedCollection(isExpanded ? null : collection.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      Jobs ({jobStats.total})
                    </Button>
                    {!collection.archived && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleArchiveCollection(collection.id)}
                        disabled={actionLoading === collection.id}
                        className="text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                      >
                        <Archive className="h-4 w-4 mr-1" />
                        Archive
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteCollection(collection.id)}
                      disabled={actionLoading === collection.id}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>

                {/* Job Stats Summary */}
                <div className="flex gap-4 mt-3 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">{jobStats.completed} completed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm">{jobStats.failed} failed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">{jobStats.pending} pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-orange-500" />
                    <span className="text-sm">{jobStats.processing} processing</span>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent>
                  <div className="space-y-3">
                    <h4 className="font-medium">Recent Jobs</h4>
                    {collection.generations.length === 0 ? (
                      <p className="text-gray-500 text-sm">No jobs found for this collection</p>
                    ) : (
                      <div className="space-y-2">
                        {collection.generations.slice(0, 10).map((gen) => (
                          <div key={gen.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                {gen.status.toLowerCase() === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                {gen.status.toLowerCase() === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                                {gen.status.toLowerCase() === 'pending' && <Clock className="h-4 w-4 text-blue-500" />}
                                {gen.status.toLowerCase() === 'processing' && <Activity className="h-4 w-4 text-orange-500" />}
                                <Badge variant="secondary" className="text-xs">{gen.status}</Badge>
                              </div>
                              <span className="text-sm font-mono">{gen.job_id || gen.id}</span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {formatDate(gen.created_at)}
                            </span>
                          </div>
                        ))}
                        {collection.generations.length > 10 && (
                          <p className="text-xs text-gray-500 text-center">
                            ... and {collection.generations.length - 10} more jobs
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {filteredCollections.length === 0 && !loading && (
          <Card>
            <CardContent className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No collections found</h3>
              <p className="text-gray-600">
                {searchTerm ? 'Try adjusting your search terms' : 'No collections available'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}