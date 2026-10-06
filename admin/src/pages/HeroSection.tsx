import { useState, useEffect } from 'react';
import { Plus, Upload, Trash2, Eye, EyeOff, Edit2, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';

interface HeroBanner {
  id: number;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function HeroSection() {
  const { apiCall } = useAuth();
  const { showToast } = useToast();
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HeroBanner | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Form state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      setLoading(true);
      console.log('Fetching banners...');
      const res = await apiCall('/hero-banners', 'GET');
      console.log('Banners response:', res);
      
      if (res && res.success && res.data) {
        setBanners(res.data);
        console.log('Banners loaded:', res.data.length);
      } else {
        console.warn('No banners data in response');
        setBanners([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch banners:', err);
      showToast(err.message || 'Failed to load banners', 'error');
      setBanners([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setFormError('Please select a valid image file');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setFormError('Image size must be less than 10MB');
        return;
      }

      setFormError('');
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const openCreateModal = () => {
    setEditingBanner(null);
    setImageFile(null);
    setImagePreview(null);
    setTitle('');
    setSubtitle('');
    setIsActive(true);
    setDisplayOrder(banners.length);
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (banner: HeroBanner) => {
    setEditingBanner(banner);
    setImageFile(null);
    setImagePreview(banner.imageUrl);
    setTitle(banner.title || '');
    setSubtitle(banner.subtitle || '');
    setIsActive(banner.isActive);
    setDisplayOrder(banner.displayOrder);
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    setEditingBanner(null);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validation
    if (!editingBanner && !imageFile) {
      setFormError('Please select an image');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      if (imageFile) formData.append('image', imageFile);
      formData.append('title', title.trim());
      formData.append('subtitle', subtitle.trim());
      formData.append('isActive', String(isActive));
      formData.append('displayOrder', String(displayOrder));

      const url = editingBanner ? `/hero-banners/${editingBanner.id}` : '/hero-banners';
      const method = editingBanner ? 'PUT' : 'POST';

      console.log('Submitting banner:', { url, method, hasImage: !!imageFile });
      const res = await apiCall(url, method, formData, true);
      console.log('Submit response:', res);

      if (res && res.success) {
        showToast(
          editingBanner ? 'Banner updated successfully!' : 'Banner created successfully!',
          'success'
        );
        setShowModal(false);
        await fetchBanners();
      } else {
        const errorMsg = res?.message || 'Failed to save banner';
        setFormError(errorMsg);
        showToast(errorMsg, 'error');
      }
    } catch (err: any) {
      console.error('Submit error:', err);
      const errorMsg = err.message || 'Failed to save banner';
      setFormError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (banner: HeroBanner) => {
    setDeletingId(banner.id);

    try {
      const res = await apiCall(`/hero-banners/${banner.id}`, 'DELETE');
      if (res && res.success) {
        showToast('Banner deleted successfully!', 'success');
        fetchBanners();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete banner', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleActive = async (banner: HeroBanner) => {
    try {
      const formData = new FormData();
      formData.append('isActive', String(!banner.isActive));

      const res = await apiCall(`/hero-banners/${banner.id}`, 'PUT', formData, true);
      if (res && res.success) {
        showToast(
          banner.isActive ? 'Banner deactivated' : 'Banner activated',
          'success'
        );
        fetchBanners();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update banner', 'error');
    }
  };

  const confirmDelete = (banner: HeroBanner) => {
    if (window.confirm(`Delete banner "${banner.title || 'Untitled'}"?\n\nThis action cannot be undone.`)) {
      handleDelete(banner);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 size={40} className="animate-spin text-primary/40 mb-4" />
        <p className="text-muted-foreground">Loading banners...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-headings text-3xl font-bold text-primary">Hero Section</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Manage homepage hero banner images. Active banners appear in the slideshow.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-semibold shadow-sm hover:shadow-md"
        >
          <Plus size={18} />
          Add Banner
        </button>
      </div>

      {/* Stats Bar */}
      {banners.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-primary">{banners.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Total Banners</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-green-600">
              {banners.filter(b => b.isActive).length}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Active</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-2xl font-bold text-gray-400">
              {banners.filter(b => !b.isActive).length}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Inactive</div>
          </div>
        </div>
      )}

      {/* Banners Grid */}
      {banners.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {banners.map((banner) => (
            <div
              key={banner.id}
              className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all hover:shadow-md ${
                !banner.isActive ? 'opacity-60' : ''
              }`}
            >
              {/* Image Preview */}
              <div className="relative aspect-video bg-gray-100">
                <img
                  src={banner.imageUrl}
                  alt={banner.title || 'Hero banner'}
                  className="w-full h-full object-cover"
                />
                
                {/* Badges */}
                <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
                  <span className="px-2.5 py-1 text-xs bg-black/70 text-white rounded-md font-semibold backdrop-blur-sm">
                    Order: {banner.displayOrder}
                  </span>
                  {banner.isActive ? (
                    <span className="px-2.5 py-1 text-xs bg-green-500 text-white rounded-md flex items-center gap-1.5 font-semibold">
                      <Eye size={12} /> Active
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-xs bg-gray-500 text-white rounded-md flex items-center gap-1.5 font-semibold">
                      <EyeOff size={12} /> Inactive
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                {/* Title/Subtitle */}
                <div className="min-h-[3rem]">
                  {banner.title ? (
                    <h3 className="font-semibold text-primary mb-1 line-clamp-1">{banner.title}</h3>
                  ) : (
                    <h3 className="font-semibold text-gray-400 mb-1 italic">Untitled Banner</h3>
                  )}
                  {banner.subtitle && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {banner.subtitle}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={() => openEditModal(banner)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-primary text-primary rounded-lg hover:bg-primary/5 transition-colors font-medium"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(banner)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    {banner.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                    {banner.isActive ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={() => confirmDelete(banner)}
                    disabled={deletingId === banner.id}
                    className="px-3 py-2 text-sm border border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors font-medium disabled:opacity-50"
                  >
                    {deletingId === banner.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Upload size={28} className="text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-primary mb-2">No Banners Yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Create your first hero banner to display on the homepage. Banners will cycle automatically.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-semibold"
          >
            <Plus size={18} />
            Create First Banner
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b flex items-center justify-between bg-gray-50">
              <div>
                <h2 className="font-headings text-2xl font-bold text-primary">
                  {editingBanner ? 'Edit Banner' : 'Add New Banner'}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {editingBanner ? 'Update banner information' : 'Upload a new hero banner image'}
                </p>
              </div>
              <button
                onClick={closeModal}
                disabled={submitting}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Error Alert */}
              {formError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">{formError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormError('')}
                    className="text-red-600 hover:text-red-800"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Banner Image {!editingBanner && <span className="text-red-500">*</span>}
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleImageChange}
                    className="hidden"
                    id="banner-image"
                    disabled={submitting}
                  />
                  <label
                    htmlFor="banner-image"
                    className="block w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary cursor-pointer transition-colors bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Upload size={20} className="text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">
                          {imageFile ? imageFile.name : 'Click to upload image'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          JPG, PNG or WebP (max 10MB)
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
                {imagePreview && (
                  <div className="mt-4 relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-56 object-cover rounded-lg border-2 border-gray-200"
                    />
                    {imageFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(editingBanner?.imageUrl || null);
                        }}
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Title <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={submitting}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  placeholder="e.g., Summer Collection 2024"
                  maxLength={255}
                />
              </div>

              {/* Subtitle */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Subtitle <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  disabled={submitting}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none"
                  placeholder="Brief description for the banner"
                  maxLength={500}
                />
                <p className="text-xs text-gray-500 mt-1">{subtitle.length}/500 characters</p>
              </div>

              {/* Display Order */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Display Order
                </label>
                <input
                  type="number"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                  disabled={submitting}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">Lower numbers appear first in the slideshow</p>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Active Status</p>
                  <p className="text-xs text-gray-500 mt-0.5">Display this banner on the homepage</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={submitting}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    {editingBanner ? 'Update Banner' : 'Create Banner'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
