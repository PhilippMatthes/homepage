from django.views.generic import TemplateView

from projects.models import Project
from addresses.models import BlockchainAddress
from weblinks.models import Weblink

class IndexView(TemplateView):
    template_name = 'index.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['projects'] = Project.objects.all()
        context['addresses'] = BlockchainAddress.objects.all()
        context['weblinks'] = Weblink.objects.order_by('title')
        return context
