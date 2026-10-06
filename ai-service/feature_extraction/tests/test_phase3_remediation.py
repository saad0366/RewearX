import unittest
import torch
from torch import nn
from feature_extraction.training.phase3_skirt_initialization import initialize_skirt_below_existing
from feature_extraction.clothing_config import CLASS_NAMES


class InitializationTests(unittest.TestCase):
    def model(self):
        m=nn.Module();m.class_names=CLASS_NAMES
        m.heads=nn.ModuleDict({'category':nn.Linear(4,12),'color':nn.Linear(4,12)})
        m.backbone=nn.Linear(4,4)
        return m

    def test_dominance_protection_and_finite_nonzero_skirt_gradients(self):
        torch.manual_seed(42);m=self.model();old={k:v.clone() for k,v in m.state_dict().items()}
        initialize_skirt_below_existing(m);keep=[i for i in range(12) if i!=8]
        for k,v in m.state_dict().items():
            if k.startswith('heads.category.'):
                self.assertTrue(torch.equal(v[keep],old[k][keep]))
            else:self.assertTrue(torch.equal(v,old[k]))
        x=torch.randn(1000,4)*10;z=m.heads['category'](x)
        self.assertTrue(torch.all(z[:,8] <= z[:,keep].max(1).values-.999))
        self.assertFalse(torch.equal(m.heads.category.weight[8],old['heads.category.weight'][8]))
        nn.functional.cross_entropy(z,torch.full((1000,),8)).backward()
        grad=m.heads.category.weight.grad[8]
        self.assertTrue(torch.isfinite(grad).all());self.assertGreater(float(grad.abs().sum()),0)
        self.assertLess(float(m.heads.category.bias.grad[8]),0)

    def test_initialization_independent_of_old_row8(self):
        m=self.model();initialize_skirt_below_existing(m)
        w=m.heads.category.weight[8].clone();b=m.heads.category.bias[8].clone()
        with torch.no_grad():m.heads.category.weight[8].fill_(999);m.heads.category.bias[8].fill_(999)
        initialize_skirt_below_existing(m)
        self.assertTrue(torch.equal(w,m.heads.category.weight[8]));self.assertTrue(torch.equal(b,m.heads.category.bias[8]))

    def test_invalid_margin_cannot_mutate_model(self):
        m=self.model();old={k:v.clone() for k,v in m.state_dict().items()}
        for margin in (0,-1,float('nan'),float('inf')):
            with self.assertRaises(ValueError):initialize_skirt_below_existing(m,margin)
        self.assertTrue(all(torch.equal(v,old[k]) for k,v in m.state_dict().items()))

if __name__=='__main__':unittest.main()
