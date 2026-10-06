import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Edit2,
  X,
  Check,
  AlertCircle,
  Loader2,
  Tag,
  Eye,
  EyeOff,
  Trash2,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  FolderTree,
  CornerDownRight,
  Layers,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';

interface Category {
  id: number;
  parentId: number | null;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
  parentCategory?: { id: number; name: string } | null;
  subcategories?: Category[];
}

export default function Categories() {
  const { apiCall } = useAuth();
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Filter & Search state
  const [filterTab, setFilterTab] = useState<'all' | 'main' | 'sub'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedParents, setExpandedParents] = useState<Record<number, boolean>>({});

  // Form state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubcategory, setIsSubcategory] = useState(false);
  const [parentId, setParentId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Dropdown menu state
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await apiCall('/categories?all=true', 'GET');
      if (res && res.success && res.data) {
        setCategories(res.data);
        // Expand all parents by default
        const initialExpand: Record<number, boolean> = {};
        res.data.forEach((c: Category) => {
          if (!c.parentId) initialExpand[c.id] = true;
        });
        setExpandedParents(initialExpand);
      } else {
        setCategories([]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load categories', 'error');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const mainCategories = useMemo(() => {
    return categories.filter((c) => !c.parentId);
  }, [categories]);

  const filteredCategories = useMemo(() => {
    let list = categories;
    if (filterTab === 'main') {
      list = list.filter((c) => !c.parentId);
    } else if (filterTab === 'sub') {
      list = list.filter((c) => Boolean(c.parentId));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description && c.description.toLowerCase().includes(q))
      );
    }

    return list;
  }, [categories, filterTab, searchQuery]);

  const toggleParentExpand = (id: number) => {
    setExpandedParents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setFormError('Please select a valid image file');
        return;
      }
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

  const openCreateModal = (presetParentId?: number) => {
    setEditingCategory(null);
    setImageFile(null);
    setImagePreview(null);
    setName('');
    setDescription('');
    if (presetParentId) {
      setIsSubcategory(true);
      setParentId(presetParentId);
    } else {
      setIsSubcategory(false);
      setParentId(null);
    }
    setIsActive(true);
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setImageFile(null);
    setImagePreview(category.iconUrl);
    setName(category.name);
    setDescription(category.description || '');
    setIsSubcategory(Boolean(category.parentId));
    setParentId(category.parentId);
    setIsActive(category.isActive);
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    setEditingCategory(null);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Category name is required');
      return;
    }

    if (isSubcategory && !parentId) {
      setFormError('Please select a parent main category for this subcategory');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      if (imageFile) formData.append('icon', imageFile);
      formData.append('name', name.trim());
      formData.append('description', description.trim() || '');
      formData.append('isActive', isActive ? 'true' : 'false');
      formData.append('parentId', isSubcategory && parentId ? String(parentId) : '');

      const url = editingCategory ? `/categories/${editingCategory.id}` : '/categories';
      const method = editingCategory ? 'PUT' : 'POST';

      const res = await apiCall(url, method, formData, true);

      if (res && res.success) {
        showToast(
          editingCategory ? 'Category updated successfully!' : 'Category created successfully!',
          'success'
        );
        setShowModal(false);
        await fetchCategories();
      } else {
        const errorMsg = res?.message || 'Failed to save category';
        setFormError(errorMsg);
        showToast(errorMsg, 'error');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to save category';
      setFormError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (category: Category) => {
    try {
      const payload = {
        name: category.name,
        isActive: !category.isActive,
      };

      const res = await apiCall(`/categories/${category.id}`, 'PUT', payload);
      if (res && res.success) {
        showToast(
          category.isActive ? 'Category deactivated' : 'Category activated',
          'success'
        );
        await fetchCategories();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update category', 'error');
    }
  };

  const handleDeactivate = async (category: Category) => {
    if (
      !window.confirm(
        `Deactivate category "${category.name}"?\n\nItems in this category will still exist but users won't be able to browse by this category.`
      )
    ) {
      return;
    }

    try {
      const res = await apiCall(`/categories/${category.id}/deactivate`, 'PATCH');
      if (res && res.success) {
        showToast('Category deactivated successfully!', 'success');
        setOpenDropdown(null);
        await fetchCategories();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to deactivate category', 'error');
    }
  };

  const handleDelete = async (category: Category) => {
    if (
      !window.confirm(
        `⚠️ PERMANENTLY DELETE "${category.name}"?\n\nThis action CANNOT be undone!\n\nThe category will be removed from the database permanently.`
      )
    ) {
      return;
    }

    try {
      const res = await apiCall(`/categories/${category.id}`, 'DELETE');
      if (res && res.success) {
        showToast('Category deleted permanently!', 'success');
        setOpenDropdown(null);
        await fetchCategories();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete category', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 size={40} className="animate-spin text-primary/40 mb-4" />
        <p className="text-muted-foreground">Loading categories...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headings text-3xl font-bold text-primary">Categories Management</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Manage main categories and subcategories for ReWearX. Active categories appear in user search and filters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreateModal()}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-semibold shadow-sm hover:shadow-md cursor-pointer"
          >
            <Plus size={18} />
            Add Main / Subcategory
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {categories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-2xs">
            <div className="text-2xl font-bold text-primary">{categories.length}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1 font-medium">Total Categories</div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-2xs">
            <div className="text-2xl font-bold text-emerald-600">
              {categories.filter((c) => !c.parentId).length}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1 font-medium">Main Categories</div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-2xs">
            <div className="text-2xl font-bold text-indigo-600">
              {categories.filter((c) => Boolean(c.parentId)).length}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1 font-medium">Subcategories</div>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-2xs">
            <div className="text-2xl font-bold text-blue-600">
              {categories.reduce((sum, c) => sum + (c.itemCount || 0), 0)}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1 font-medium">Total Items</div>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border">
        <div className="flex items-center gap-1.5 w-full sm:w-auto bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filterTab === 'all' ? 'bg-white text-primary shadow-2xs' : 'text-gray-600 hover:text-primary'
            }`}
          >
            All ({categories.length})
          </button>
          <button
            onClick={() => setFilterTab('main')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filterTab === 'main' ? 'bg-white text-primary shadow-2xs' : 'text-gray-600 hover:text-primary'
            }`}
          >
            Main Categories ({mainCategories.length})
          </button>
          <button
            onClick={() => setFilterTab('sub')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filterTab === 'sub' ? 'bg-white text-primary shadow-2xs' : 'text-gray-600 hover:text-primary'
            }`}
          >
            Subcategories ({categories.length - mainCategories.length})
          </button>
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      {/* Categories List / Table */}
      {filteredCategories.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Category Name
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Type / Parent
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCategories.map((category) => {
                const isMain = !category.parentId;
                const parentObj = category.parentCategory || categories.find((c) => c.id === category.parentId);
                const subCount = categories.filter((c) => c.parentId === category.id).length;

                return (
                  <tr
                    key={category.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      !category.isActive ? 'opacity-60' : ''
                    } ${isMain ? 'bg-white font-medium' : 'bg-gray-50/40'}`}
                  >
                    {/* Name */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {!isMain && (
                          <CornerDownRight size={16} className="text-gray-400 shrink-0 ml-2" />
                        )}
                        {category.iconUrl ? (
                          <img src={category.iconUrl} alt="" className="w-9 h-9 rounded-lg object-cover border" />
                        ) : (
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isMain ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
                            {isMain ? <FolderTree size={18} /> : <Layers size={18} />}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-primary flex items-center gap-2 text-sm">
                            {category.name}
                            {isMain && subCount > 0 && (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                                {subCount} subcategories
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Type / Parent */}
                    <td className="px-6 py-4">
                      {isMain ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <FolderTree size={12} /> Main Category
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Layers size={12} /> Under: <strong className="font-bold">{parentObj?.name || 'Main'}</strong>
                        </span>
                      )}
                    </td>

                    {/* Description */}
                    <td className="px-6 py-4">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {category.description || <span className="italic text-gray-400">No description</span>}
                      </p>
                    </td>

                    {/* Items */}
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200">
                        {category.itemCount || 0}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 text-center">
                      {category.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-green-100 text-green-800 rounded-full font-semibold">
                          <Eye size={12} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-200 text-gray-600 rounded-full font-semibold">
                          <EyeOff size={12} /> Inactive
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {isMain && (
                          <button
                            onClick={() => openCreateModal(category.id)}
                            className="px-2.5 py-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md font-semibold border border-emerald-200 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Add subcategory under this category"
                          >
                            <Plus size={13} /> Subcategory
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(category)}
                          className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => toggleActive(category)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title={category.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {category.isActive ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>

                        {/* More Actions Dropdown */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenDropdown(openDropdown === category.id ? null : category.id)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            title="More actions"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {openDropdown === category.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenDropdown(null)}
                              />
                              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-20 py-1">
                                <button
                                  onClick={() => {
                                    setOpenDropdown(null);
                                    handleDeactivate(category);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700 cursor-pointer"
                                >
                                  <EyeOff size={14} />
                                  Deactivate
                                </button>
                                <div className="border-t my-1" />
                                <button
                                  onClick={() => {
                                    setOpenDropdown(null);
                                    handleDelete(category);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 text-red-600 font-medium cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                  Delete Permanently
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Tag size={28} className="text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-primary mb-2">No Categories Found</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Create your first main category or subcategory to organize items.
          </p>
          <button
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-semibold cursor-pointer"
          >
            <Plus size={18} />
            Create Category
          </button>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-xs"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-headings text-2xl font-bold text-primary">
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {editingCategory ? 'Update category & subcategory details' : 'Create a main category or a subcategory'}
                </p>
              </div>
              <button
                onClick={closeModal}
                disabled={submitting}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body - Form */}
            <form onSubmit={handleSubmit} className="flex flex-col">
              <div className="p-6 space-y-4">
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
                      className="text-red-600 hover:text-red-800 cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* Category Type Switch */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    Category Type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSubcategory(false);
                        setParentId(null);
                      }}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        !isSubcategory
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <FolderTree size={16} />
                      Main Category
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSubcategory(true)}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        isSubcategory
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-2xs'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Layers size={16} />
                      Subcategory
                    </button>
                  </div>
                </div>

                {/* Parent Category Dropdown (Visible if Subcategory) */}
                {isSubcategory && (
                  <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-2">
                    <label className="block text-xs font-bold text-indigo-900">
                      Select Main Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={parentId || ''}
                      onChange={(e) => setParentId(Number(e.target.value) || null)}
                      className="w-full px-3.5 py-2 text-xs border border-indigo-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                      required={isSubcategory}
                    >
                      <option value="">-- Choose a Main Category --</option>
                      {mainCategories
                        .filter((m) => m.id !== editingCategory?.id)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-indigo-700">
                      This subcategory will appear under the selected main category.
                    </p>
                  </div>
                )}

                {/* Category Icon Upload */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">
                      Category Icon <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleImageChange}
                      className="hidden"
                      id="category-icon"
                      disabled={submitting}
                    />
                    <label
                      htmlFor="category-icon"
                      className="block w-full px-3 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary cursor-pointer transition-colors bg-gray-50"
                    >
                      <div className="flex flex-col items-center text-center">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mb-1.5">
                          <Tag size={18} className="text-primary" />
                        </div>
                        <p className="text-xs font-medium text-gray-700">
                          {imageFile ? 'Image Selected' : 'Click to upload'}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          JPG, PNG or WebP (max 10MB)
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Image Preview */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">
                      Preview
                    </label>
                    <div className="w-full h-[105px] border-2 border-gray-200 rounded-lg flex items-center justify-center bg-gray-50">
                      {imagePreview ? (
                        <div className="relative w-full h-full">
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="w-full h-full object-cover rounded-lg"
                          />
                          {imageFile && (
                            <button
                              type="button"
                              onClick={() => {
                                setImageFile(null);
                                setImagePreview(editingCategory?.iconUrl || null);
                              }}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">No image uploaded</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Category Name & Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">
                      Category Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={submitting}
                      className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder={isSubcategory ? 'e.g., Jackets, T-Shirts, Sneakers' : "e.g., Men's Wear, Footwear"}
                      maxLength={100}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">
                      Status
                    </label>
                    <div className="flex items-center justify-between h-[38px] px-3 bg-gray-50 rounded-lg border">
                      <span className="text-xs text-gray-700 font-medium">Visible in filters</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => setIsActive(e.target.checked)}
                          disabled={submitting}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Description <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={submitting}
                    rows={2.5}
                    className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                    placeholder="Brief description of this category..."
                    maxLength={500}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-semibold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-semibold text-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      {editingCategory ? 'Update Category' : 'Create Category'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
