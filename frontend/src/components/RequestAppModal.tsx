
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader } from '@/components/ui/card';
import { createAppRequest, type AppRequestData } from '@/lib/api';
import { Loader2, X, CheckCircle } from 'lucide-react';

interface RequestAppModalProps {
  onClose: () => void;
  districtSlug: string;
}

export default function RequestAppModal({ onClose, districtSlug }: RequestAppModalProps) {
  const [formData, setFormData] = useState<AppRequestData>({
    name: '',
    company: '',
    url: '',
    notes: '',
    email: '',
    phone_check: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await createAppRequest(districtSlug, formData);
      setSuccess(true);
      setTimeout(() => {
          onClose(); // Auto close after 2s
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
      return (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <Card className="w-full max-w-md shadow-2xl p-8 flex flex-col items-center text-center space-y-4" onClick={e => e.stopPropagation()}>
                <div className="h-12 w-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-semibold">Request Submitted</h2>
                <p className="text-muted-foreground">Thank you! Your request has been sent for review.</p>
                <Button onClick={onClose} className="w-full">Close</Button>
            </Card>
         </div>
      );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <Card className="w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <CardHeader className="border-b pb-3 pt-4 px-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Request New App</h2>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                        <X className="w-4 h-4"/>
                    </Button>
                </div>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 rounded bg-destructive/10 text-destructive text-sm font-medium">
                            {error}
                        </div>
                    )}
                    
                    <div className="space-y-1.5">
                        <Label>App Name <span className="text-destructive">*</span></Label>
                        <Input 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                            required 
                            placeholder="e.g. Canva"
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1.5">
                            <Label>Company (Optional)</Label>
                            <Input 
                                value={formData.company} 
                                onChange={e => setFormData({...formData, company: e.target.value})} 
                                placeholder="e.g. Canva Inc."
                            />
                        </div>
                         <div className="space-y-1.5">
                            <Label>Website (Optional)</Label>
                            <Input 
                                value={formData.url} 
                                onChange={e => setFormData({...formData, url: e.target.value})} 
                                placeholder="https://"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Your Email (Optional)</Label>
                        <Input 
                            type="email"
                            value={formData.email} 
                            onChange={e => setFormData({...formData, email: e.target.value})} 
                            placeholder="To notify you of updates"
                        />
                    </div>
                    
                    <div className="space-y-1.5">
                        <Label>Reason / Notes</Label>
                        <textarea 
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={formData.notes} 
                            onChange={e => setFormData({...formData, notes: e.target.value})} 
                            placeholder="Why do you need this app?"
                        />
                    </div>
                    
                    {/* Honeypot field - keeping it hidden */}
                    <div className="hidden" aria-hidden="true">
                        <Input 
                            name="phone_check"
                            value={formData.phone_check || ''} 
                            onChange={e => setFormData({...formData, phone_check: e.target.value})} 
                            tabIndex={-1} 
                            autoComplete="off"
                        />
                    </div>
                </div>
                <div className="p-6 pt-0 flex justify-end gap-2">
                     <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
                     <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Submit Request
                     </Button>
                </div>
            </form>
        </Card>
    </div>
  );
}
